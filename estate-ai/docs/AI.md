# Optional AI (off by default)

The copilot works fully offline: every number comes from `src/core/calc.ts`. An optional language model can
reword answers. It receives only the locally computed facts and is instructed not to add any.

## Free: Ollama on your computer

1. Install Ollama (free) from ollama.com and pull a small model: `ollama pull llama3.2`
2. Allow the app's address to call it, then start it:
   `OLLAMA_ORIGINS="http://localhost:5173,https://<your-ip>:4173" ollama serve`
3. In ESTATE AI → Settings → Optional AI: provider Ollama, endpoint `http://localhost:11434`, model `llama3.2`,
   Test connection, enable.

On the iPhone, `localhost` is the phone itself; use `http://<computer-ip>:11434` and set `OLLAMA_HOST=0.0.0.0`.
Note: an https page calling an http endpoint is blocked by Safari (mixed content), so phone use needs the
desktop page or an https proxy.

LM Studio and llama.cpp's server also work, as “OpenAI-compatible endpoint” at their local address.

## Costs money

A cloud OpenAI-compatible endpoint usually charges per request and receives the question's facts. The settings
page warns when the endpoint is not local. Nothing in the app requires it.

## Not included

Generative image editing for staging. Free local options (e.g. Stable Diffusion via ComfyUI/Automatic1111) need
a strong GPU and several GB of models; staging here uses 3D concepts and photo overlays instead.
