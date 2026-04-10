# Roadmap

Our vision for DeepTutor's future development.

## ✅ Recently Completed (v0.4.0)

- [x] **RAG Module Decoupling** — Modular RAG architecture with provider-agnostic interface
  - Currently standardized on llamaindex
  - More backends coming soon
- [x] **Multi-Provider Support** — Expanded LLM and Embedding provider options
  - LLM: OpenAI, Anthropic, Azure, Ollama, Groq, OpenRouter, DeepSeek, Gemini
  - Embedding: OpenAI, Jina, Cohere, Ollama, LM Studio, HuggingFace
- [x] **Dark Mode** — System-wide dark/light theme support
- [x] **Environment Configuration** — Unified `.env` based configuration

## ✅ Recently Completed (v0.6.x — Custom Fork)

- [x] **OpenMAIC Classroom Integration** — THU-MAIC interactive AI classroom runs as a sibling service, with RAG-enriched content generation via DeepTutor knowledge bases
- [x] **Knowledge Base Selector** — Users can select a DeepTutor KB from the OpenMAIC generation toolbar to inject RAG context into scene outlines
- [x] **Tailscale Sidecar Deployment** — Docker Compose orchestration with Tailscale sidecar for secure remote access (HTTPS via TS Serve)
- [x] **Upstream Sync (2026-04-10)** — Fresh sync from HKUDS/DeepTutor main + THU-MAIC/OpenMAIC with all customizations re-applied
- [x] **i18n Migration** — All custom strings ported to the new i18next JSON locale system (en-US, zh-CN, ja-JP, ru-RU)

## 🚀 Planned Features

- [ ] **Deepcoding from Research Drafts** — Transform research and Co-Writer outputs into working prototypes
- [ ] **Personalized Memory** — Adapt tutoring style based on user learning history
- [ ] **Additional RAG Backends** — ChromaDB, Pinecone integration
- [ ] **More Embedding Adapters** — Voyage AI, Mixedbread, local transformers

## 💭 Under Consideration

- Multi-language support
- Mobile-friendly interface
- Collaborative learning features
- Voice interaction support
- Faster frontend framework

## 🤝 Community Requests

Have a feature idea? We'd love to hear it!

- Open a [Feature Request](https://github.com/HKUDS/DeepTutor/issues/new?template=feature_request.yml)
- Join the discussion on existing proposals
- Check our [GitHub Discussions](https://github.com/HKUDS/DeepTutor/discussions)

---

⭐ **Star the repo** to follow our future updates!
