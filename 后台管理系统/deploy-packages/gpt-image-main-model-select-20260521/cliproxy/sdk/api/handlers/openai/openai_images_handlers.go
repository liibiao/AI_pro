package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/interfaces"
	"github.com/router-for-me/CLIProxyAPI/v6/sdk/api/handlers"
	log "github.com/sirupsen/logrus"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

const (
	defaultImagesMainModel = "gpt-5.4-mini"
	defaultImagesToolModel = "gpt-image-2"
)

var imagesURLStore = &imageURLStore{items: make(map[string]storedImage)}

type imageCallResult struct {
	Result        string
	RevisedPrompt string
	OutputFormat  string
	Size          string
	Background    string
	Quality       string
}

type imageURLStore struct {
	mu      sync.RWMutex
	counter uint64
	items   map[string]storedImage
}

type storedImage struct {
	Data        string
	ContentType string
	CreatedAt   time.Time
}

// gptImage2Request is the new official-field-first request structure for /v1/images/edits
type gptImage2Request struct {
	Model          string
	MainModel      string
	Prompt         string
	Images         []string // official "image" field: array of file-xxx | URL | data URL
	Mask           string   // official "mask" field: file-xxx | data URL
	Size           string
	Count          int
	Background     string
	ResponseFormat string
	Stream         bool
}

// imageInputInfo holds parsed image input details for logging/processing
type imageInputInfo struct {
	Original string // original user input (for logging summary)
	Kind     string // "file_id" | "url" | "data_url"
}

func (s *imageURLStore) Put(contentType string, data string) string {
	if strings.TrimSpace(contentType) == "" {
		contentType = "image/png"
	}
	id := atomic.AddUint64(&s.counter, 1)
	key := fmt.Sprintf("img_%d_%d", time.Now().UnixNano(), id)
	s.mu.Lock()
	s.items[key] = storedImage{Data: data, ContentType: contentType, CreatedAt: time.Now()}
	s.mu.Unlock()
	return "/v1/images/results/" + key
}

func (s *imageURLStore) Get(key string) (storedImage, bool) {
	s.mu.RLock()
	item, ok := s.items[key]
	s.mu.RUnlock()
	return item, ok
}

// PutDirect stores an image with an explicit key (used for file-xxx uploads)
func (s *imageURLStore) PutDirect(key string, contentType string, data string) {
	if strings.TrimSpace(contentType) == "" {
		contentType = "image/png"
	}
	s.mu.Lock()
	s.items[key] = storedImage{Data: data, ContentType: contentType, CreatedAt: time.Now()}
	s.mu.Unlock()
}

type sseFrameAccumulator struct {
	pending []byte
}

func (a *sseFrameAccumulator) AddChunk(chunk []byte) [][]byte {
	if len(chunk) == 0 {
		return nil
	}

	if responsesSSENeedsLineBreak(a.pending, chunk) {
		a.pending = append(a.pending, '\n')
	}
	a.pending = append(a.pending, chunk...)

	var frames [][]byte
	for {
		frameLen := responsesSSEFrameLen(a.pending)
		if frameLen == 0 {
			break
		}
		frames = append(frames, a.pending[:frameLen])
		copy(a.pending, a.pending[frameLen:])
		a.pending = a.pending[:len(a.pending)-frameLen]
	}

	if len(bytes.TrimSpace(a.pending)) == 0 {
		a.pending = a.pending[:0]
		return frames
	}
	if len(a.pending) == 0 || !responsesSSECanEmitWithoutDelimiter(a.pending) {
		return frames
	}
	frames = append(frames, a.pending)
	a.pending = a.pending[:0]
	return frames
}

func (a *sseFrameAccumulator) Flush() [][]byte {
	if len(a.pending) == 0 {
		return nil
	}

	var frames [][]byte
	for {
		frameLen := responsesSSEFrameLen(a.pending)
		if frameLen == 0 {
			break
		}
		frames = append(frames, a.pending[:frameLen])
		copy(a.pending, a.pending[frameLen:])
		a.pending = a.pending[:len(a.pending)-frameLen]
	}

	if len(bytes.TrimSpace(a.pending)) == 0 {
		a.pending = nil
		return frames
	}
	if responsesSSECanEmitWithoutDelimiter(a.pending) {
		frames = append(frames, a.pending)
	}
	a.pending = nil
	return frames
}

func mimeTypeFromOutputFormat(outputFormat string) string {
	if outputFormat == "" {
		return "image/png"
	}
	if strings.Contains(outputFormat, "/") {
		return outputFormat
	}
	switch strings.ToLower(strings.TrimSpace(outputFormat)) {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	default:
		return "image/png"
	}
}

func (h *OpenAIAPIHandler) ImageResult(c *gin.Context) {
	key := strings.TrimSpace(c.Param("key"))
	if key == "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	item, ok := imagesURLStore.Get(key)
	if !ok || strings.TrimSpace(item.Data) == "" {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	data, err := base64.StdEncoding.DecodeString(item.Data)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, item.ContentType, data)
}

func multipartFileToDataURL(fileHeader *multipart.FileHeader) (string, error) {
	if fileHeader == nil {
		return "", fmt.Errorf("upload file is nil")
	}
	f, err := fileHeader.Open()
	if err != nil {
		return "", fmt.Errorf("open upload file failed: %w", err)
	}
	defer func() {
		if errClose := f.Close(); errClose != nil {
			log.Errorf("openai images: close upload file error: %v", errClose)
		}
	}()

	data, err := io.ReadAll(f)
	if err != nil {
		return "", fmt.Errorf("read upload file failed: %w", err)
	}

	mediaType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if mediaType == "" {
		mediaType = http.DetectContentType(data)
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	return "data:" + mediaType + ";base64," + b64, nil
}

func parseIntField(raw string, fallback int64) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fallback
	}
	return v
}

func parseBoolField(raw string, fallback bool) bool {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return fallback
	}
	switch raw {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func writeImagesBadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
		Error: handlers.ErrorDetail{
			Message: message,
			Type:    "invalid_request_error",
		},
	})
}

// parseGPTImage2JSONRequest parses and validates requests for /v1/images/edits (official gpt-image-2 API).
// This replaces the old normalizeImagesJSONRequest with official-field-first approach.
func parseGPTImage2JSONRequest(rawJSON []byte, requireImages bool) (gptImage2Request, error) {
	var req gptImage2Request

	if !json.Valid(rawJSON) {
		return req, fmt.Errorf("Invalid request: body must be valid JSON")
	}

	// 1. Validate prompt (required)
	req.Prompt = strings.TrimSpace(gjson.GetBytes(rawJSON, "prompt").String())
	if req.Prompt == "" {
		return req, fmt.Errorf("Invalid request: prompt is required")
	}

	// 2. Model (optional, default: gpt-image-2)
	req.Model = strings.TrimSpace(gjson.GetBytes(rawJSON, "model").String())
	if req.Model == "" {
		req.Model = defaultImagesToolModel // "gpt-image-2"
	}
	req.MainModel = parseImagesMainModelField(rawJSON)

	// 3. Parse official "image" field (array of strings)
	req.Images = parseImageField(rawJSON)

	// 4. Validate requireImages flag
	if requireImages && len(req.Images) == 0 {
		return req, fmt.Errorf("Invalid request: image is required for image editing")
	}

	// 5. Parse official "mask" field (string)
	req.Mask = strings.TrimSpace(gjson.GetBytes(rawJSON, "mask").String())

	// 6. Validate mask requires image
	if req.Mask != "" && len(req.Images) == 0 {
		return req, fmt.Errorf("Invalid request: mask requires image to be provided")
	}

	// 7. Parse size (optional, default: 1024x1024)
	req.Size = parseSizeField(rawJSON)

	// 8. Parse n (optional, default: 1)
	req.Count = parseCountField(rawJSON)

	// 9. Parse background (optional, default: auto)
	req.Background = strings.TrimSpace(gjson.GetBytes(rawJSON, "background").String())
	if req.Background == "" {
		req.Background = "auto"
	}

	// 10. Parse response_format (optional, default: url)
	req.ResponseFormat = strings.TrimSpace(gjson.GetBytes(rawJSON, "response_format").String())
	if req.ResponseFormat == "" {
		req.ResponseFormat = "url" // Default to url per user requirement
	}

	// 11. Parse stream (optional, default: false)
	req.Stream = gjson.GetBytes(rawJSON, "stream").Bool()

	return req, nil
}

func parseImagesMainModelField(rawJSON []byte) string {
	candidates := []string{
		"main_model",
		"mainModel",
		"responses_model",
		"responsesModel",
		"codex_model",
		"codexModel",
		"imageMainModel",
	}
	for _, path := range candidates {
		if model := normalizeImagesMainModel(gjson.GetBytes(rawJSON, path).String()); model != "" {
			return model
		}
	}
	return ""
}

func normalizeImagesMainModel(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	prefix := ""
	model := raw
	if idx := strings.LastIndex(raw, "/"); idx > 0 && idx < len(raw)-1 {
		prefix = strings.TrimSpace(raw[:idx])
		model = strings.TrimSpace(raw[idx+1:])
	}
	switch strings.ToLower(model) {
	case "gpt-5.5":
		model = "gpt-5.5"
	case "gpt-5.4":
		model = "gpt-5.4"
	case "gpt-5.4-mini":
		model = "gpt-5.4-mini"
	default:
		return ""
	}
	if prefix != "" {
		return prefix + "/" + model
	}
	return model
}

// parseImageField parses the official "image" field (array of strings).
// Supports: file-xxx, URL, data:image/...;base64,...
func parseImageField(rawJSON []byte) []string {
	var images []string

	if result := gjson.GetBytes(rawJSON, "image"); result.Exists() {
		if !result.IsArray() {
			return images
		}
		for _, img := range result.Array() {
			value := strings.TrimSpace(img.String())
			if value == "" {
				continue
			}
			if isLocalPath(value) {
				continue
			}
			images = append(images, value)
		}
	}

	return images
}

// isLocalPath checks if a string looks like a local file path (not allowed)
func isLocalPath(s string) bool {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "./") || strings.HasPrefix(s, "../") || strings.HasPrefix(s, "/") {
		return true
	}
	if len(s) > 2 && s[1] == ':' && (s[2] == '\\' || s[2] == '/') {
		// Windows path like C:\ or C:/
		return true
	}
	return false
}

// parseSizeField parses and validates the "size" field
// Supports:
//   - ratio strings: "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"
//   - "auto" for automatic size selection
//   - pixel values: "WxH" where W and H meet the GPT Image 2 constraints
func parseSizeField(rawJSON []byte) string {
	size := strings.TrimSpace(gjson.GetBytes(rawJSON, "size").String())
	if size == "" {
		return "1024x1024" // default
	}

	// Support "auto"
	if strings.ToLower(size) == "auto" {
		return "auto"
	}

	// Support ratio strings (APIMart doc)
	allowedRatios := map[string]bool{
		"1:1": true, "3:2": true, "2:3": true,
		"4:3": true, "3:4": true, "5:4": true,
		"4:5": true, "16:9": true, "9:16": true,
		"2:1": true, "1:2": true, "21:9": true,
		"9:21": true,
	}
	if allowedRatios[size] {
		return size
	}

	// Support pixel values: validate against constraints (YingTu doc)
	if strings.Contains(size, "x") {
		parts := strings.Split(size, "x")
		if len(parts) == 2 {
			width, errW := strconv.Atoi(parts[0])
			height, errH := strconv.Atoi(parts[1])
			if errW == nil && errH == nil && isValidImageSize(width, height) {
				return size
			}
		}
	}

	// Invalid size, fall back to default
	log.Warnf("Invalid size value: %q, falling back to 1024x1024", size)
	return "1024x1024" // fallback to default
}

// isValidImageSize validates pixel dimensions against GPT Image 2 constraints:
// 1. max(width, height) <= 3840
// 2. width % 16 == 0 && height % 16 == 0
// 3. max(width, height) / min(width, height) <= 3
// 4. width * height >= 655360
// 5. width * height <= 8294400
func isValidImageSize(width, height int) bool {
	longEdge := width
	shortEdge := height
	if height > longEdge {
		longEdge = height
		shortEdge = width
	}

	// Constraint: shortEdge must be positive
	if shortEdge == 0 {
		return false
	}

	// Constraint 1: max edge <= 3840
	if longEdge > 3840 {
		return false
	}

	// Constraint 2: both edges must be multiples of 16
	if width%16 != 0 || height%16 != 0 {
		return false
	}

	// Constraint 3: aspect ratio <= 3:1 (using integer arithmetic)
	if longEdge > 3*shortEdge {
		return false
	}

	// Constraints 4 & 5: total pixels in range [655360, 8294400]
	pixels := width * height
	if pixels < 655360 || pixels > 8294400 {
		return false
	}

	return true
}

// parseCountField parses the "n" field (count)
func parseCountField(rawJSON []byte) int {
	count := int64(1)

	if v := gjson.GetBytes(rawJSON, "n"); v.Exists() {
		if v.Type != gjson.Number {
			return 1
		}
		count = v.Int()
	}

	if count < 1 {
		return 1
	}
	if count > 4 {
		return 4
	}
	return int(count)
}

func (h *OpenAIAPIHandler) ImagesGenerations(c *gin.Context) {
	h.legacyImagesGenerations(c)
}

// legacyImagesGenerations contains the old /v1/images/generations execution path.
// It is intentionally isolated and not registered in the active API chain.
func (h *OpenAIAPIHandler) legacyImagesGenerations(c *gin.Context) {
	rawJSON, err := c.GetRawData()
	if err != nil {
		writeImagesBadRequest(c, fmt.Sprintf("Invalid request: %v", err))
		return
	}

	req, err := parseGPTImage2JSONRequest(rawJSON, false)
	if err != nil {
		writeImagesBadRequest(c, err.Error())
		return
	}

	var imageDataURLs []string
	for _, img := range req.Images {
		dataURL, err := resolveImageInput(img)
		if err != nil {
			writeImagesBadRequest(c, fmt.Sprintf("Invalid request: invalid image: %v", err))
			return
		}
		if dataURL != "" {
			imageDataURLs = append(imageDataURLs, dataURL)
		}
	}

	maskDataURL := ""
	if req.Mask != "" {
		maskDataURL, err = resolveImageInput(req.Mask)
		if err != nil {
			writeImagesBadRequest(c, fmt.Sprintf("Invalid request: invalid mask: %v", err))
			return
		}
	}

	tool := buildImageTool(req, maskDataURL)
	responsesReq := buildImagesResponsesRequest(req.Prompt, imageDataURLs, tool, req.MainModel, req.Stream)

	streamPrefix := "image_generation"
	if len(imageDataURLs) > 0 {
		streamPrefix = "image_edit"
	}

	if req.Stream {
		h.streamImagesFromResponses(c, responsesReq, req.ResponseFormat, streamPrefix)
		return
	}
	h.collectImagesFromResponses(c, responsesReq, req.ResponseFormat)
}

// buildImageTool builds the tool JSON from gptImage2Request
func buildImageTool(req gptImage2Request, maskDataURL string) []byte {
	action := "generate"
	if len(req.Images) > 0 {
		action = "edit"
	}

	tool := []byte(`{"type":"image_generation","action":"generate"}`)
	tool, _ = sjson.SetBytes(tool, "action", action)
	tool, _ = sjson.SetBytes(tool, "model", req.Model)
	tool, _ = sjson.SetBytes(tool, "size", req.Size)
	tool, _ = sjson.SetBytes(tool, "background", req.Background)

	if maskDataURL != "" {
		tool, _ = sjson.SetBytes(tool, "input_image_mask.image_url", maskDataURL)
	}

	return tool
}

func (h *OpenAIAPIHandler) ImagesEdits(c *gin.Context) {
	contentType := strings.ToLower(strings.TrimSpace(c.GetHeader("Content-Type")))
	if strings.HasPrefix(contentType, "application/json") || contentType == "" {
		h.imagesEditsFromJSON(c)
		return
	}

	c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
		Error: handlers.ErrorDetail{
			Message: fmt.Sprintf("Invalid request: unsupported Content-Type %q; use application/json and upload files via /v1/files first", contentType),
			Type:    "invalid_request_error",
		},
	})
}

// legacyImagesEditsFromMultipart contains the old direct multipart image edit path.
// It is intentionally isolated; active clients should upload files via /v1/files
// and then pass file-xxx IDs to /v1/images/edits JSON requests.
func (h *OpenAIAPIHandler) legacyImagesEditsFromMultipart(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: %v", err),
				Type:    "invalid_request_error",
			},
		})
		return
	}

	prompt := strings.TrimSpace(c.PostForm("prompt"))
	if prompt == "" {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Invalid request: prompt is required",
				Type:    "invalid_request_error",
			},
		})
		return
	}

	var imageFiles []*multipart.FileHeader
	if files := form.File["image[]"]; len(files) > 0 {
		imageFiles = files
	} else if files := form.File["image"]; len(files) > 0 {
		imageFiles = files
	}
	if len(imageFiles) == 0 {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Invalid request: image is required",
				Type:    "invalid_request_error",
			},
		})
		return
	}

	images := make([]string, 0, len(imageFiles))
	for _, fh := range imageFiles {
		dataURL, err := multipartFileToDataURL(fh)
		if err != nil {
			c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
				Error: handlers.ErrorDetail{
					Message: fmt.Sprintf("Invalid request: %v", err),
					Type:    "invalid_request_error",
				},
			})
			return
		}
		images = append(images, dataURL)
	}

	var maskDataURL *string
	if maskFiles := form.File["mask"]; len(maskFiles) > 0 && maskFiles[0] != nil {
		dataURL, err := multipartFileToDataURL(maskFiles[0])
		if err != nil {
			c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
				Error: handlers.ErrorDetail{
					Message: fmt.Sprintf("Invalid request: %v", err),
					Type:    "invalid_request_error",
				},
			})
			return
		}
		maskDataURL = &dataURL
	}

	imageModel := strings.TrimSpace(c.PostForm("model"))
	if imageModel == "" {
		imageModel = defaultImagesToolModel
	}
	responseFormat := strings.TrimSpace(c.PostForm("response_format"))
	if responseFormat == "" {
		responseFormat = "url"
	}
	stream := parseBoolField(c.PostForm("stream"), false)

	tool := []byte(`{"type":"image_generation","action":"edit"}`)
	tool, _ = sjson.SetBytes(tool, "model", imageModel)

	if v := strings.TrimSpace(c.PostForm("size")); v != "" {
		tool, _ = sjson.SetBytes(tool, "size", v)
	} else {
		width := strings.TrimSpace(c.PostForm("width"))
		height := strings.TrimSpace(c.PostForm("height"))
		if width != "" && height != "" {
			tool, _ = sjson.SetBytes(tool, "size", fmt.Sprintf("%sx%s", width, height))
		}
	}
	if v := strings.TrimSpace(c.PostForm("quality")); v != "" {
		tool, _ = sjson.SetBytes(tool, "quality", v)
	}
	if v := strings.TrimSpace(c.PostForm("background")); v != "" {
		tool, _ = sjson.SetBytes(tool, "background", v)
	}
	if v := strings.TrimSpace(c.PostForm("output_format")); v != "" {
		tool, _ = sjson.SetBytes(tool, "output_format", v)
	}
	if v := strings.TrimSpace(c.PostForm("input_fidelity")); v != "" {
		tool, _ = sjson.SetBytes(tool, "input_fidelity", v)
	}
	if v := strings.TrimSpace(c.PostForm("moderation")); v != "" {
		tool, _ = sjson.SetBytes(tool, "moderation", v)
	}

	if v := strings.TrimSpace(c.PostForm("output_compression")); v != "" {
		tool, _ = sjson.SetBytes(tool, "output_compression", parseIntField(v, 0))
	}
	if v := strings.TrimSpace(c.PostForm("partial_images")); v != "" {
		tool, _ = sjson.SetBytes(tool, "partial_images", parseIntField(v, 0))
	}

	if maskDataURL != nil && strings.TrimSpace(*maskDataURL) != "" {
		tool, _ = sjson.SetBytes(tool, "input_image_mask.image_url", strings.TrimSpace(*maskDataURL))
	}

		responsesReq := buildImagesResponsesRequest(prompt, images, tool, "", stream)
	if stream {
		h.streamImagesFromResponses(c, responsesReq, responseFormat, "image_edit")
		return
	}
	h.collectImagesFromResponses(c, responsesReq, responseFormat)
}

func (h *OpenAIAPIHandler) imagesEditsFromJSON(c *gin.Context) {
	rawJSON, err := c.GetRawData()
	if err != nil {
		writeImagesBadRequest(c, fmt.Sprintf("Invalid request: %v", err))
		return
	}

	// Use new official-field-first parser
	req, err := parseGPTImage2JSONRequest(rawJSON, false) // false: don't require images (support text-to-image)
	if err != nil {
		writeImagesBadRequest(c, err.Error())
		return
	}

	// Build tool JSON for Responses API (compatibility layer)
	tool := buildImageToolFromRequest(req)

	// Parse mask if provided
	var maskDataURL string
	if req.Mask != "" {
		maskDataURL, err = resolveImageInput(req.Mask)
		if err != nil {
			writeImagesBadRequest(c, fmt.Sprintf("Invalid request: invalid mask: %v", err))
			return
		}
		if maskDataURL != "" {
			tool, _ = sjson.SetBytes(tool, "input_image_mask.image_url", maskDataURL)
		}
	}

	// Parse all image inputs
	var imageDataURLs []string
	for _, img := range req.Images {
		dataURL, err := resolveImageInput(img)
		if err != nil {
			writeImagesBadRequest(c, fmt.Sprintf("Invalid request: invalid image: %v", err))
			return
		}
		if dataURL != "" {
			imageDataURLs = append(imageDataURLs, dataURL)
		}
	}

	responsesReq := buildImagesResponsesRequest(req.Prompt, imageDataURLs, tool, req.MainModel, req.Stream)
	if req.Stream {
		h.streamImagesFromResponses(c, responsesReq, req.ResponseFormat, "image_edit")
		return
	}
	h.collectImagesFromResponses(c, responsesReq, req.ResponseFormat)
}

// buildImageToolFromRequest builds the tool JSON from gptImage2Request
func buildImageToolFromRequest(req gptImage2Request) []byte {
	tool := []byte(`{"type":"image_generation","action":"generate"}`)

	action := "generate"
	if len(req.Images) > 0 {
		action = "edit"
	}
	tool, _ = sjson.SetBytes(tool, "action", action)
	tool, _ = sjson.SetBytes(tool, "model", req.Model)
	tool, _ = sjson.SetBytes(tool, "size", req.Size)
	tool, _ = sjson.SetBytes(tool, "background", req.Background)

	return tool
}

// resolveImageInput resolves an image input (file-xxx | URL | data URL) to a data URL
func resolveImageInput(input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", nil
	}

	// Case 1: data URL (already ready)
	if strings.HasPrefix(input, "data:") {
		return input, nil
	}

	// Case 2: URL (keep as-is for now, upstream will handle)
	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		return input, nil
	}

	// Case 3: file-xxx (look up from in-memory file store)
	if strings.HasPrefix(input, "file-") {
		item, ok := imagesURLStore.Get(input)
		if !ok || strings.TrimSpace(item.Data) == "" {
			return "", fmt.Errorf("file not found: %s", input)
		}
		return "data:" + item.ContentType + ";base64," + item.Data, nil
	}

	return "", fmt.Errorf("invalid image input: %s", input)
}

func buildImagesResponsesRequest(prompt string, images []string, toolJSON []byte, options ...any) []byte {
	req := []byte(`{"instructions":"","stream":true,"reasoning":{"effort":"medium","summary":"auto"},"parallel_tool_calls":true,"include":["reasoning.encrypted_content"],"model":"","store":false,"tool_choice":{"type":"image_generation"}}`)
	stream := true
	mainModelOverride := ""
	for _, option := range options {
		switch value := option.(type) {
		case bool:
			stream = value
		case string:
			mainModelOverride = value
		}
	}
	req, _ = sjson.SetBytes(req, "stream", stream)
	mainModel := normalizeImagesMainModel(mainModelOverride)
	if mainModel == "" {
		mainModel = defaultImagesMainModel
	}
	if len(toolJSON) > 0 && json.Valid(toolJSON) {
		toolModel := strings.TrimSpace(gjson.GetBytes(toolJSON, "model").String())
		if idx := strings.LastIndex(toolModel, "/"); idx > 0 && idx < len(toolModel)-1 {
			prefix := strings.TrimSpace(toolModel[:idx])
			if prefix != "" && !strings.Contains(mainModel, "/") {
				mainModel = prefix + "/" + mainModel
			}
		}
	}
	req, _ = sjson.SetBytes(req, "model", mainModel)

	input := []byte(`[{"type":"message","role":"user","content":[{"type":"input_text","text":""}]}]`)
	input, _ = sjson.SetBytes(input, "0.content.0.text", prompt)
	contentIndex := 1
	for _, img := range images {
		if strings.TrimSpace(img) == "" {
			continue
		}
		part := []byte(`{"type":"input_image","image_url":""}`)
		part, _ = sjson.SetBytes(part, "image_url", img)
		path := fmt.Sprintf("0.content.%d", contentIndex)
		input, _ = sjson.SetRawBytes(input, path, part)
		contentIndex++
	}
	req, _ = sjson.SetRawBytes(req, "input", input)

	req, _ = sjson.SetRawBytes(req, "tools", []byte(`[]`))
	if len(toolJSON) > 0 && json.Valid(toolJSON) {
		req, _ = sjson.SetRawBytes(req, "tools.-1", toolJSON)
	}
	return req
}

func (h *OpenAIAPIHandler) collectImagesFromResponses(c *gin.Context, responsesReq []byte, responseFormat string) {
	c.Header("Content-Type", "application/json")

	cliCtx, cliCancel := h.GetContextWithCancel(h, c, context.Background())
	cliCtx = handlers.WithDisallowFreeAuth(cliCtx)
	stopKeepAlive := h.StartNonStreamingKeepAlive(c, cliCtx)

	mainModel := strings.TrimSpace(gjson.GetBytes(responsesReq, "model").String())
	if mainModel == "" {
		mainModel = defaultImagesMainModel
	}
	resp, upstreamHeaders, errMsg := h.ExecuteWithAuthManager(cliCtx, "openai-response", mainModel, responsesReq, "")
	stopKeepAlive()
	if errMsg != nil {
		h.WriteErrorResponse(c, errMsg)
		if errMsg.Error != nil {
			cliCancel(errMsg.Error)
		} else {
			cliCancel(nil)
		}
		return
	}
	out, errMsg := collectImagesFromResponsesPayload(resp, responseFormat)
	if errMsg != nil {
		h.WriteErrorResponse(c, errMsg)
		if errMsg.Error != nil {
			cliCancel(errMsg.Error)
		} else {
			cliCancel(nil)
		}
		return
	}
	handlers.WriteUpstreamHeaders(c.Writer.Header(), upstreamHeaders)
	_, _ = c.Writer.Write(out)
	cliCancel()
}

func collectImagesFromResponsesPayload(payload []byte, responseFormat string) ([]byte, *interfaces.ErrorMessage) {
	if len(bytes.TrimSpace(payload)) == 0 {
		return nil, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("upstream returned empty image response")}
	}
	if failedType := gjson.GetBytes(payload, "type").String(); failedType == "response.failed" {
		return nil, errorMessageFromResponsesFailed(payload)
	}
	if message, ok := imageResponsesPayloadErrorMessage(payload); ok {
		return nil, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("%s", message)}
	}
	results, createdAt, usageRaw, firstMeta, err := extractImagesFromResponsesPayload(payload)
	if err != nil {
		return nil, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: err}
	}
	if len(results) == 0 {
		return nil, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("upstream did not return image output")}
	}
	out, err := buildImagesAPIResponse(results, createdAt, usageRaw, firstMeta, responseFormat)
	if err != nil {
		return nil, &interfaces.ErrorMessage{StatusCode: http.StatusInternalServerError, Error: err}
	}
	return out, nil
}

func imageResponsesPayloadErrorMessage(payload []byte) (string, bool) {
	errorResult := gjson.GetBytes(payload, "error")
	if !errorResult.Exists() || errorResult.Type == gjson.Null {
		return "", false
	}
	message := strings.TrimSpace(errorResult.Get("message").String())
	if message == "" && errorResult.Type == gjson.String {
		message = strings.TrimSpace(errorResult.String())
	}
	if message == "" {
		message = strings.TrimSpace(errorResult.Raw)
	}
	if message == "" || message == "null" {
		return "", false
	}
	return message, true
}

func collectImagesFromResponsesStream(ctx context.Context, data <-chan []byte, errs <-chan *interfaces.ErrorMessage, responseFormat string) ([]byte, *interfaces.ErrorMessage) {
	acc := &sseFrameAccumulator{}

	processFrame := func(frame []byte) ([]byte, bool, *interfaces.ErrorMessage) {
		for _, line := range bytes.Split(frame, []byte("\n")) {
			trimmed := bytes.TrimSpace(bytes.TrimRight(line, "\r"))
			if len(trimmed) == 0 {
				continue
			}
			if !bytes.HasPrefix(trimmed, []byte("data:")) {
				continue
			}
			payload := bytes.TrimSpace(trimmed[len("data:"):])
			if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) {
				continue
			}
			if !json.Valid(payload) {
				return nil, false, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("invalid SSE data JSON")}
			}

			// Log response event types for troubleshooting.
			eventType := gjson.GetBytes(payload, "type").String()
			if eventType != "" {
				log.Debugf("[Images Debug] Responses event: type=%s", eventType)
			}
			if eventType == "response.failed" {
				log.Errorf("[Images Debug] Responses failed: %s", string(payload))
				return nil, false, errorMessageFromResponsesFailed(payload)
			}

			if eventType != "response.completed" {
				continue
			}

			// Log the completed response for troubleshooting image output issues.
			if log.GetLevel() >= log.DebugLevel {
				payloadStr := string(payload)
				if len(payloadStr) > 1000 {
					payloadStr = payloadStr[:1000] + "..."
				}
				log.Debugf("[Images Debug] Responses completed event: %s", payloadStr)
			}

			results, createdAt, usageRaw, firstMeta, err := extractImagesFromResponsesCompleted(payload)
			if err != nil {
				return nil, false, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: err}
			}
			if len(results) == 0 {
				return nil, false, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("upstream did not return image output")}
			}
			out, err := buildImagesAPIResponse(results, createdAt, usageRaw, firstMeta, responseFormat)
			if err != nil {
				return nil, false, &interfaces.ErrorMessage{StatusCode: http.StatusInternalServerError, Error: err}
			}
			return out, true, nil
		}
		return nil, false, nil
	}

	for {
		select {
		case <-ctx.Done():
			return nil, &interfaces.ErrorMessage{StatusCode: http.StatusRequestTimeout, Error: ctx.Err()}
		case errMsg, ok := <-errs:
			if ok && errMsg != nil {
				return nil, errMsg
			}
			errs = nil
		case chunk, ok := <-data:
			if !ok {
				for _, frame := range acc.Flush() {
					if out, done, errMsg := processFrame(frame); errMsg != nil {
						return nil, errMsg
					} else if done {
						return out, nil
					}
				}
				return nil, &interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("stream disconnected before completion")}
			}
			for _, frame := range acc.AddChunk(chunk) {
				if out, done, errMsg := processFrame(frame); errMsg != nil {
					return nil, errMsg
				} else if done {
					return out, nil
				}
			}
		}
	}
}

func errorMessageFromResponsesFailed(payload []byte) *interfaces.ErrorMessage {
	message := strings.TrimSpace(gjson.GetBytes(payload, "response.error.message").String())
	if message == "" {
		message = strings.TrimSpace(gjson.GetBytes(payload, "error.message").String())
	}
	if message == "" {
		message = "upstream image generation failed"
	}

	code := strings.TrimSpace(gjson.GetBytes(payload, "response.error.code").String())
	if code == "" {
		code = strings.TrimSpace(gjson.GetBytes(payload, "error.code").String())
	}
	if code == "" {
		code = "upstream_error"
	}

	errType := strings.TrimSpace(gjson.GetBytes(payload, "response.error.type").String())
	if errType == "" {
		errType = strings.TrimSpace(gjson.GetBytes(payload, "error.type").String())
	}
	if errType == "" {
		errType = "server_error"
	}

	status := http.StatusBadGateway
	if code == "moderation_blocked" {
		status = http.StatusBadRequest
		errType = "invalid_request_error"
	}

	body, err := json.Marshal(handlers.ErrorResponse{
		Error: handlers.ErrorDetail{
			Message: message,
			Type:    errType,
			Code:    code,
		},
	})
	if err != nil {
		return &interfaces.ErrorMessage{StatusCode: status, Error: fmt.Errorf("%s", message)}
	}
	return &interfaces.ErrorMessage{StatusCode: status, Error: fmt.Errorf("%s", string(body))}
}

func extractImagesFromResponsesCompleted(payload []byte) (results []imageCallResult, createdAt int64, usageRaw []byte, firstMeta imageCallResult, err error) {
	if gjson.GetBytes(payload, "type").String() != "response.completed" {
		return nil, 0, nil, imageCallResult{}, fmt.Errorf("unexpected event type")
	}
	return extractImagesFromResponsesPayload(payload)
}

func extractImagesFromResponsesPayload(payload []byte) (results []imageCallResult, createdAt int64, usageRaw []byte, firstMeta imageCallResult, err error) {
	createdAt = gjson.GetBytes(payload, "response.created_at").Int()
	if createdAt <= 0 {
		createdAt = gjson.GetBytes(payload, "created_at").Int()
	}
	if createdAt <= 0 {
		createdAt = gjson.GetBytes(payload, "created").Int()
	}
	if createdAt <= 0 {
		createdAt = time.Now().Unix()
	}

	output := gjson.GetBytes(payload, "response.output")
	if !output.IsArray() {
		output = gjson.GetBytes(payload, "output")
	}
	if output.IsArray() {
		for _, item := range output.Array() {
			if item.Get("type").String() != "image_generation_call" {
				continue
			}
			res := strings.TrimSpace(item.Get("result").String())
			if res == "" {
				res = strings.TrimSpace(item.Get("url").String())
			}
			if res == "" {
				res = strings.TrimSpace(item.Get("image_url").String())
			}
			if res == "" {
				continue
			}
			entry := imageCallResult{
				Result:        res,
				RevisedPrompt: strings.TrimSpace(item.Get("revised_prompt").String()),
				OutputFormat:  strings.TrimSpace(item.Get("output_format").String()),
				Size:          strings.TrimSpace(item.Get("size").String()),
				Background:    strings.TrimSpace(item.Get("background").String()),
				Quality:       strings.TrimSpace(item.Get("quality").String()),
			}
			if len(results) == 0 {
				firstMeta = entry
			}
			results = append(results, entry)
		}
	}

	if usage := gjson.GetBytes(payload, "response.tool_usage.image_gen"); usage.Exists() && usage.IsObject() {
		usageRaw = []byte(usage.Raw)
	} else if usage := gjson.GetBytes(payload, "tool_usage.image_gen"); usage.Exists() && usage.IsObject() {
		usageRaw = []byte(usage.Raw)
	} else if usage := gjson.GetBytes(payload, "usage"); usage.Exists() && usage.IsObject() {
		usageRaw = []byte(usage.Raw)
	}

	return results, createdAt, usageRaw, firstMeta, nil
}

func buildImagesAPIResponse(results []imageCallResult, createdAt int64, usageRaw []byte, firstMeta imageCallResult, responseFormat string) ([]byte, error) {
	out := []byte(`{"created":0,"data":[]}`)
	out, _ = sjson.SetBytes(out, "created", createdAt)

	responseFormat = strings.ToLower(strings.TrimSpace(responseFormat))
	if responseFormat == "" {
		responseFormat = "url"
	}

	for _, img := range results {
		item := []byte(`{}`)
		if responseFormat == "b64_json" {
			item, _ = sjson.SetBytes(item, "b64_json", img.Result)
		} else {
			item, _ = sjson.SetBytes(item, "url", imageResultURL(img.OutputFormat, img.Result))
		}
		if img.RevisedPrompt != "" {
			item, _ = sjson.SetBytes(item, "revised_prompt", img.RevisedPrompt)
		}
		out, _ = sjson.SetRawBytes(out, "data.-1", item)
	}

	if firstMeta.Background != "" {
		out, _ = sjson.SetBytes(out, "background", firstMeta.Background)
	}
	if firstMeta.OutputFormat != "" {
		out, _ = sjson.SetBytes(out, "output_format", firstMeta.OutputFormat)
	}
	if firstMeta.Quality != "" {
		out, _ = sjson.SetBytes(out, "quality", firstMeta.Quality)
	}
	if firstMeta.Size != "" {
		out, _ = sjson.SetBytes(out, "size", firstMeta.Size)
	}

	if len(usageRaw) > 0 && json.Valid(usageRaw) {
		out, _ = sjson.SetRawBytes(out, "usage", usageRaw)
	}

	return out, nil
}

func (h *OpenAIAPIHandler) streamImagesFromResponses(c *gin.Context, responsesReq []byte, responseFormat string, streamPrefix string) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Streaming not supported",
				Type:    "server_error",
			},
		})
		return
	}

	cliCtx, cliCancel := h.GetContextWithCancel(h, c, context.Background())
	cliCtx = handlers.WithDisallowFreeAuth(cliCtx)
	mainModel := strings.TrimSpace(gjson.GetBytes(responsesReq, "model").String())
	if mainModel == "" {
		mainModel = defaultImagesMainModel
	}
	dataChan, upstreamHeaders, errChan := h.ExecuteStreamWithAuthManager(cliCtx, "openai-response", mainModel, responsesReq, "")

	setSSEHeaders := func() {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("Access-Control-Allow-Origin", "*")
	}

	writeEvent := func(eventName string, dataJSON []byte) {
		if strings.TrimSpace(eventName) != "" {
			_, _ = fmt.Fprintf(c.Writer, "event: %s\n", eventName)
		}
		_, _ = fmt.Fprintf(c.Writer, "data: %s\n\n", string(dataJSON))
		flusher.Flush()
	}

	// Peek for first chunk/error so we can still return a JSON error body.
	for {
		select {
		case <-c.Request.Context().Done():
			cliCancel(c.Request.Context().Err())
			return
		case errMsg, ok := <-errChan:
			if !ok {
				errChan = nil
				continue
			}
			h.WriteErrorResponse(c, errMsg)
			if errMsg != nil {
				cliCancel(errMsg.Error)
			} else {
				cliCancel(nil)
			}
			return
		case chunk, ok := <-dataChan:
			if !ok {
				setSSEHeaders()
				handlers.WriteUpstreamHeaders(c.Writer.Header(), upstreamHeaders)
				_, _ = c.Writer.Write([]byte("\n"))
				flusher.Flush()
				cliCancel(nil)
				return
			}

			setSSEHeaders()
			handlers.WriteUpstreamHeaders(c.Writer.Header(), upstreamHeaders)

			h.forwardImagesStream(cliCtx, c, flusher, func(err error) { cliCancel(err) }, dataChan, errChan, chunk, responseFormat, streamPrefix, writeEvent)
			return
		}
	}
}

// UploadFile handles POST /v1/files for uploading images (OpenAI-compatible)
func (h *OpenAIAPIHandler) UploadFile(c *gin.Context) {
	// Only support multipart/form-data
	contentType := strings.ToLower(strings.TrimSpace(c.GetHeader("Content-Type")))
	if !strings.HasPrefix(contentType, "multipart/form-data") {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Invalid request: /v1/files requires multipart/form-data",
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Parse multipart form
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: %v", err),
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Validate purpose (must be "vision" for image uploads)
	purpose := strings.TrimSpace(c.PostForm("purpose"))
	if purpose == "" {
		purpose = "vision" // default
	}
	if purpose != "vision" {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: purpose must be 'vision' for image uploads, got %q", purpose),
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Get uploaded file
	files := form.File["file"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Invalid request: no file uploaded",
				Type:    "invalid_request_error",
			},
		})
		return
	}

	fileHeader := files[0]
	if fileHeader == nil {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: "Invalid request: uploaded file is nil",
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Open and read file
	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: %v", err),
				Type:    "invalid_request_error",
			},
		})
		return
	}
	defer func() {
		if errClose := f.Close(); errClose != nil {
			log.Errorf("openai files: close upload file error: %v", errClose)
		}
	}()

	data, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: %v", err),
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Validate file is an image
	mimeType := http.DetectContentType(data)
	if !strings.HasPrefix(mimeType, "image/") {
		c.JSON(http.StatusBadRequest, handlers.ErrorResponse{
			Error: handlers.ErrorDetail{
				Message: fmt.Sprintf("Invalid request: uploaded file must be an image, got %q", mimeType),
				Type:    "invalid_request_error",
			},
		})
		return
	}

	// Generate file ID (OpenAI-compatible format: file-xxx)
	fileID := generateFileID()

	// Store file data in imagesURLStore using fileID as key
	encoded := base64.StdEncoding.EncodeToString(data)
	imagesURLStore.PutDirect(fileID, mimeType, encoded)

	// Log the upload
	log.Infof("File uploaded: ID=%s, filename=%s, size=%d, mime=%s",
		fileID, fileHeader.Filename, len(data), mimeType)

	// Return OpenAI-compatible file object
	c.JSON(http.StatusOK, gin.H{
		"id":         fileID,
		"object":     "file",
		"bytes":      len(data),
		"created_at": time.Now().Unix(),
		"filename":   fileHeader.Filename,
		"purpose":    purpose,
	})
}

// generateFileID generates an OpenAI-compatible file ID (file-xxx format)
func generateFileID() string {
	return fmt.Sprintf("file-%d", time.Now().UnixNano())
}

func (h *OpenAIAPIHandler) forwardImagesStream(ctx context.Context, c *gin.Context, flusher http.Flusher, cancel func(error), data <-chan []byte, errs <-chan *interfaces.ErrorMessage, firstChunk []byte, responseFormat string, streamPrefix string, writeEvent func(string, []byte)) {
	acc := &sseFrameAccumulator{}

	responseFormat = strings.ToLower(strings.TrimSpace(responseFormat))
	if responseFormat == "" {
		responseFormat = "url"
	}

	emitError := func(errMsg *interfaces.ErrorMessage) {
		if errMsg == nil {
			return
		}
		status := http.StatusInternalServerError
		if errMsg.StatusCode > 0 {
			status = errMsg.StatusCode
		}
		errText := http.StatusText(status)
		if errMsg.Error != nil && strings.TrimSpace(errMsg.Error.Error()) != "" {
			errText = errMsg.Error.Error()
		}
		body := handlers.BuildErrorResponseBody(status, errText)
		writeEvent("error", body)
	}

	processFrame := func(frame []byte) (done bool) {
		for _, line := range bytes.Split(frame, []byte("\n")) {
			trimmed := bytes.TrimSpace(bytes.TrimRight(line, "\r"))
			if len(trimmed) == 0 || !bytes.HasPrefix(trimmed, []byte("data:")) {
				continue
			}
			payload := bytes.TrimSpace(trimmed[len("data:"):])
			if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) || !json.Valid(payload) {
				continue
			}

			switch gjson.GetBytes(payload, "type").String() {
			case "response.failed":
				log.Errorf("[Images Debug] Responses failed: %s", string(payload))
				emitError(errorMessageFromResponsesFailed(payload))
				return true
			case "response.image_generation_call.partial_image":
				b64 := strings.TrimSpace(gjson.GetBytes(payload, "partial_image_b64").String())
				if b64 == "" {
					continue
				}
				outputFormat := strings.TrimSpace(gjson.GetBytes(payload, "output_format").String())
				index := gjson.GetBytes(payload, "partial_image_index").Int()
				eventName := streamPrefix + ".partial_image"
				data := []byte(`{"type":"","partial_image_index":0}`)
				data, _ = sjson.SetBytes(data, "type", eventName)
				data, _ = sjson.SetBytes(data, "partial_image_index", index)
				if responseFormat == "b64_json" {
					data, _ = sjson.SetBytes(data, "b64_json", b64)
				} else {
					data, _ = sjson.SetBytes(data, "url", imageResultURL(outputFormat, b64))
				}
				writeEvent(eventName, data)
			case "response.completed":
				results, _, usageRaw, _, err := extractImagesFromResponsesCompleted(payload)
				if err != nil {
					emitError(&interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: err})
					return true
				}
				if len(results) == 0 {
					emitError(&interfaces.ErrorMessage{StatusCode: http.StatusBadGateway, Error: fmt.Errorf("upstream did not return image output")})
					return true
				}
				eventName := streamPrefix + ".completed"
				for _, img := range results {
					data := []byte(`{"type":""}`)
					data, _ = sjson.SetBytes(data, "type", eventName)
					if responseFormat == "b64_json" {
						data, _ = sjson.SetBytes(data, "b64_json", img.Result)
					} else {
						data, _ = sjson.SetBytes(data, "url", imageResultURL(img.OutputFormat, img.Result))
					}
					if len(usageRaw) > 0 && json.Valid(usageRaw) {
						data, _ = sjson.SetRawBytes(data, "usage", usageRaw)
					}
					writeEvent(eventName, data)
				}
				return true
			}
		}
		return false
	}

	for _, frame := range acc.AddChunk(firstChunk) {
		if processFrame(frame) {
			cancel(nil)
			return
		}
	}

	for {
		select {
		case <-c.Request.Context().Done():
			cancel(c.Request.Context().Err())
			return
		case errMsg, ok := <-errs:
			if ok && errMsg != nil {
				emitError(errMsg)
				cancel(errMsg.Error)
				return
			}
			errs = nil
		case chunk, ok := <-data:
			if !ok {
				for _, frame := range acc.Flush() {
					if processFrame(frame) {
						cancel(nil)
						return
					}
				}
				cancel(nil)
				return
			}
			for _, frame := range acc.AddChunk(chunk) {
				if processFrame(frame) {
					cancel(nil)
					return
				}
			}
		}
	}
}
