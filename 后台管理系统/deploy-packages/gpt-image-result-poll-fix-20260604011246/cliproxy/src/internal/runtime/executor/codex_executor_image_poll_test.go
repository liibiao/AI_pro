package executor

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/executor"
	sdktranslator "github.com/router-for-me/CLIProxyAPI/v6/sdk/translator"
)

func TestCodexExecutorPollsCompletedImageGenerationWithoutResult(t *testing.T) {
	t.Setenv("GPT_IMAGE_BACKGROUND_POLL_MS", "250")

	var postCount atomic.Int32
	var pollCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case http.MethodPost + " /responses":
			postCount.Add(1)
			_, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"resp_poll_1","object":"response","status":"completed","output":[{"id":"ig_1","type":"image_generation_call","status":"generating","output_format":"png"}]}`))
		case http.MethodGet + " /responses/resp_poll_1":
			pollCount.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"resp_poll_1","object":"response","status":"completed","output":[{"id":"ig_1","type":"image_generation_call","status":"completed","output_format":"png","result":"aGVsbG8="}]}`))
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	executor := NewCodexExecutor(&config.Config{})
	auth := &cliproxyauth.Auth{Attributes: map[string]string{
		"base_url": server.URL,
		"api_key":  "test",
	}}
	payload := []byte(`{"model":"gpt-5.4-mini","stream":false,"input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"cat"}]}],"tools":[{"type":"image_generation","model":"gpt-image-2","size":"1024x1024"}],"tool_choice":{"type":"image_generation"}}`)

	resp, err := executor.Execute(context.Background(), auth, cliproxyexecutor.Request{
		Model:   "gpt-5.4-mini",
		Payload: payload,
	}, cliproxyexecutor.Options{
		SourceFormat:    sdktranslator.FromString("openai-response"),
		OriginalRequest: payload,
		Stream:          false,
	})
	if err != nil {
		t.Fatalf("Execute error: %v", err)
	}
	if postCount.Load() != 1 {
		t.Fatalf("POST count = %d, want 1", postCount.Load())
	}
	if pollCount.Load() != 1 {
		t.Fatalf("poll count = %d, want 1", pollCount.Load())
	}
	if !strings.Contains(string(resp.Payload), "aGVsbG8=") {
		t.Fatalf("response payload missing image result: %s", string(resp.Payload))
	}
}

func TestCodexImageGenerationOutputPendingIgnoresFailedResponses(t *testing.T) {
	payload := []byte(`{"id":"resp_failed","object":"response","status":"failed","error":{"message":"nope"},"output":[{"type":"image_generation_call","status":"generating"}]}`)
	if codexImageGenerationOutputPending(payload) {
		t.Fatal("failed response must not be treated as pollable")
	}
}
