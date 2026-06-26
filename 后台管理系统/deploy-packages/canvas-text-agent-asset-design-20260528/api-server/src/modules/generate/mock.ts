type ChatMessage = { role: string; content: string };

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] || char));
}

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mockImageResponse(input: { prompt: string; size: string; quantity: number }) {
  const [widthRaw, heightRaw] = input.size.split('x');
  const width = Math.max(256, Math.min(2048, Number(widthRaw) || 1024));
  const height = Math.max(256, Math.min(2048, Number(heightRaw) || width));
  const images = Array.from({ length: input.quantity }, (_, index) => {
    const title = escapeXml(input.prompt.slice(0, 80));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#1f6feb"/><stop offset="1" stop-color="#18a058"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.76}" cy="${height * 0.24}" r="${Math.min(width, height) * 0.16}" fill="rgba(255,255,255,0.2)"/><text x="${width * 0.08}" y="${height * 0.45}" fill="#fff" font-family="Arial, sans-serif" font-size="${Math.max(24, Math.floor(width / 22))}" font-weight="700">Mock Image ${index + 1}</text><text x="${width * 0.08}" y="${height * 0.55}" fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif" font-size="${Math.max(16, Math.floor(width / 40))}">${title}</text></svg>`;
    return { url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  });
  return { id: id('mock-image'), status: 'succeeded', data: images, mock: true };
}

export function mockVideoStartResponse(input: { prompt: string; durationSeconds: number }) {
  const taskId = id('mock-video');
  return {
    id: taskId,
    taskId,
    status: 'completed',
    video_url: `mock-video://${taskId}?duration=${input.durationSeconds}`,
    prompt: input.prompt,
    mock: true,
  };
}

export function mockVideoStatusResponse(taskId: string) {
  return {
    id: taskId,
    taskId,
    status: 'completed',
    video_url: `mock-video://${taskId}`,
    mock: true,
  };
}

export function mockChatResponse(messages: ChatMessage[], inputTokens: number) {
  const last = messages[messages.length - 1]?.content || '';
  const content = `Mock reply: ${last.slice(0, 180) || 'empty prompt'}`;
  return {
    id: id('mock-chat'),
    choices: [{ message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: Math.max(1, Math.ceil(content.length / 3)),
    },
    mock: true,
  };
}
