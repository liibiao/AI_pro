(() => {
  const wf = {
    nodes: [
      { id: 'n1', type: 'stylePreset', x: -520, y: 0, w: 320, values: { activePreset: '', selectedTags: [] }, status: 'waiting', data: null },
      { id: 'n2', type: 'img2imgAll', x: 0, y: 0, w: 520, values: { images: [], chips: [], i2iDraft: '', _modelIdx: '0', protocol: 'fast', size: '1024x1536', resolution: '1k', quality: '', background: '', outputFormat: 'png', strength: '0.65', n: '1' }, status: 'waiting', data: null },
      { id: 'n3', type: 'singleImage', x: 560, y: 0, w: 320, values: { images: [] }, status: 'waiting', data: null }
    ],
    conns: [
      { from: 'n1', fromPort: 'prompt', to: 'n2', toPort: 'style', kind: 'prompt' },
      { from: 'n2', fromPort: 'image', to: 'n3', toPort: 'image', kind: 'image' }
    ],
    view: { tx: 360, ty: 170, scale: 1 },
    next: 4,
    muted: []
  };
  localStorage.setItem('mjb_runninghub_workflow_v1', JSON.stringify(wf));
  return { ok: true, nodes: wf.nodes.length };
})()
