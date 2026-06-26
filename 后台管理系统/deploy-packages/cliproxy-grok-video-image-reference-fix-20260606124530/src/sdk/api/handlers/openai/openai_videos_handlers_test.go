package openai

import (
	"encoding/json"
	"testing"
)

func TestBuildXAIVideosCreateRequestPreservesReferenceDurationFor15Preview(t *testing.T) {
	rawJSON := []byte(`{
		"model":"grok-imagine-video-1.5-preview",
		"prompt":"animate the character",
		"duration":15,
		"size":"1280x720",
		"reference_images":[
			{"url":"https://example.com/a.png"},
			{"url":"https://example.com/b.png"}
		]
	}`)

	req, meta, err := buildXAIVideosCreateRequest(rawJSON, "grok-imagine-video-1.5-preview")
	if err != nil {
		t.Fatalf("build request: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(req, &payload); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if payload["model"] != xaiVideos15PreviewModel {
		t.Fatalf("model = %v, want %s", payload["model"], xaiVideos15PreviewModel)
	}
	if payload["duration"] != float64(15) {
		t.Fatalf("duration = %v, want 15", payload["duration"])
	}
	if meta.Seconds != "15" {
		t.Fatalf("meta seconds = %q, want 15", meta.Seconds)
	}
	refs, ok := payload["reference_images"].([]any)
	if !ok || len(refs) != 2 {
		t.Fatalf("reference_images = %#v, want 2 entries", payload["reference_images"])
	}
}

func TestBuildXAIVideosCreateRequestPreservesReferenceDurationForDefaultModel(t *testing.T) {
	rawJSON := []byte(`{
		"model":"grok-imagine-video",
		"prompt":"animate the character",
		"duration":15,
		"size":"1280x720",
		"reference_images":[{"url":"https://example.com/a.png"}]
	}`)

	req, meta, err := buildXAIVideosCreateRequest(rawJSON, "grok-imagine-video")
	if err != nil {
		t.Fatalf("build request: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(req, &payload); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if payload["duration"] != float64(15) {
		t.Fatalf("duration = %v, want 15", payload["duration"])
	}
	if meta.Seconds != "15" {
		t.Fatalf("meta seconds = %q, want 15", meta.Seconds)
	}
}

func TestBuildXAIVideosCreateRequestConvertsSingleReferenceImageToImageForImageToVideo(t *testing.T) {
	rawJSON := []byte(`{
		"model":"grok-imagine-video-1.5-preview",
		"prompt":"animate the character",
		"duration":15,
		"size":"1280x720",
		"videoMode":"image-to-video",
		"reference_images":[{"url":"https://example.com/a.png"}]
	}`)

	req, _, err := buildXAIVideosCreateRequest(rawJSON, "grok-imagine-video-1.5-preview")
	if err != nil {
		t.Fatalf("build request: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(req, &payload); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if _, ok := payload["reference_images"]; ok {
		t.Fatalf("reference_images should be omitted for image-to-video: %#v", payload["reference_images"])
	}
	image, ok := payload["image"].(map[string]any)
	if !ok {
		t.Fatalf("image = %#v, want object", payload["image"])
	}
	if image["url"] != "https://example.com/a.png" {
		t.Fatalf("image.url = %#v, want reference URL", image["url"])
	}
}
