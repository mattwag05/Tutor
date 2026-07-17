from pathlib import Path

from deeptutor.services.config import model_catalog as model_catalog_module
from deeptutor.services.config.env_store import EnvStore
from deeptutor.services.config.model_catalog import ModelCatalogService


def test_load_hydrates_empty_catalog_from_env(tmp_path: Path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "LLM_BINDING=google",
                "LLM_MODEL=gemini-3-flash-preview",
                "LLM_API_KEY=test-llm-key",
                "LLM_HOST=https://example-llm.test/v1",
                "EMBEDDING_BINDING=openai",
                "EMBEDDING_MODEL=text-embedding-3-large",
                "EMBEDDING_API_KEY=test-emb-key",
                "EMBEDDING_HOST=https://example-emb.test/v1",
                "EMBEDDING_DIMENSION=3072",
                "SEARCH_PROVIDER=perplexity",
                "SEARCH_API_KEY=test-search-key",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "embedding": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "search": {"active_profile_id": null, "profiles": []}
  }
}
""",
        encoding="utf-8",
    )

    env_store = EnvStore(path=env_path)
    monkeypatch.setattr(model_catalog_module, "get_env_store", lambda: env_store)

    service = ModelCatalogService(path=catalog_path)
    catalog = service.load()

    assert catalog["services"]["llm"]["profiles"][0]["binding"] == "google"
    assert catalog["services"]["llm"]["profiles"][0]["extra_headers"] == {}
    assert (
        catalog["services"]["llm"]["profiles"][0]["models"][0]["model"] == "gemini-3-flash-preview"
    )
    assert catalog["services"]["embedding"]["profiles"][0]["models"][0]["dimension"] == "3072"
    assert catalog["services"]["search"]["profiles"][0]["provider"] == "perplexity"
    assert catalog["services"]["search"]["profiles"][0]["proxy"] == ""


def test_load_normalizes_empty_search_provider_to_duckduckgo(tmp_path: Path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text("", encoding="utf-8")
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "embedding": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "search": {
      "active_profile_id": "search-profile-default",
      "profiles": [
        {
          "id": "search-profile-default",
          "name": "Default Search Provider",
          "provider": "",
          "base_url": "",
          "api_key": "",
          "api_version": "",
          "proxy": "",
          "models": []
        }
      ]
    }
  }
}
""",
        encoding="utf-8",
    )

    env_store = EnvStore(path=env_path)
    monkeypatch.setattr(model_catalog_module, "get_env_store", lambda: env_store)

    service = ModelCatalogService(path=catalog_path)
    catalog = service.load()

    assert catalog["services"]["search"]["profiles"][0]["provider"] == "duckduckgo"


def test_load_syncs_existing_active_profiles_from_env(tmp_path: Path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "LLM_BINDING=dashscope",
                "LLM_MODEL=qwen3.5-plus",
                "LLM_API_KEY=new-llm-key",
                "LLM_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1",
                "EMBEDDING_BINDING=dashscope",
                "EMBEDDING_MODEL=text-embedding-v4",
                "EMBEDDING_API_KEY=new-emb-key",
                "EMBEDDING_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1",
                "EMBEDDING_DIMENSION=2048",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {
      "active_profile_id": "llm-profile-default",
      "active_model_id": "llm-model-default",
      "profiles": [
        {
          "id": "llm-profile-default",
          "name": "Default LLM Endpoint",
          "binding": "openai",
          "base_url": "https://old-llm.example/v1",
          "api_key": "old-llm-key",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {"id": "llm-model-default", "name": "old-model", "model": "old-model"}
          ]
        }
      ]
    },
    "embedding": {
      "active_profile_id": "embedding-profile-default",
      "active_model_id": "embedding-model-default",
      "profiles": [
        {
          "id": "embedding-profile-default",
          "name": "Default Embedding Endpoint",
          "binding": "openai",
          "base_url": "https://old-emb.example/v1",
          "api_key": "old-emb-key",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {
              "id": "embedding-model-default",
              "name": "old-embedding",
              "model": "old-embedding",
              "dimension": "3072"
            }
          ]
        }
      ]
    },
    "search": {"active_profile_id": null, "profiles": []}
  }
}
""",
        encoding="utf-8",
    )

    env_store = EnvStore(path=env_path)
    monkeypatch.setattr(model_catalog_module, "get_env_store", lambda: env_store)

    service = ModelCatalogService(path=catalog_path)
    catalog = service.load()

    llm_profile = catalog["services"]["llm"]["profiles"][0]
    llm_model = llm_profile["models"][0]
    emb_profile = catalog["services"]["embedding"]["profiles"][0]
    emb_model = emb_profile["models"][0]

    assert llm_profile["binding"] == "dashscope"
    assert llm_profile["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert llm_profile["api_key"] == "new-llm-key"
    assert llm_model["model"] == "qwen3.5-plus"
    assert llm_model["name"] == "qwen3.5-plus"
    assert emb_profile["binding"] == "dashscope"
    assert emb_profile["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert emb_profile["api_key"] == "new-emb-key"
    assert emb_model["model"] == "text-embedding-v4"
    assert emb_model["name"] == "text-embedding-v4"
    assert emb_model["dimension"] == "2048"


def test_load_hydrates_image_tts_asr_from_env(tmp_path: Path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "IMAGE_BINDING=openrouter-image",
                "IMAGE_MODEL=google/gemini-3.1-flash-image-preview",
                "IMAGE_API_KEY=test-image-key",
                "IMAGE_HOST=https://openrouter.ai/api/v1",
                "TTS_BINDING=elevenlabs-tts",
                "TTS_MODEL=elevenlabs-multilingual-v2",
                "TTS_API_KEY=test-tts-key",
                "TTS_URL=https://api.elevenlabs.io/v1",
                "TTS_VOICE=Rachel",
                "ASR_BINDING=openai-asr",
                "ASR_MODEL=whisper-1",
                "ASR_API_KEY=test-asr-key",
                "ASR_HOST=https://api.openai.com/v1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "embedding": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "image": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "tts": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "asr": {"active_profile_id": null, "active_model_id": null, "profiles": []},
    "search": {"active_profile_id": null, "profiles": []}
  }
}
""",
        encoding="utf-8",
    )

    env_store = EnvStore(path=env_path)
    monkeypatch.setattr(model_catalog_module, "get_env_store", lambda: env_store)

    service = ModelCatalogService(path=catalog_path)
    catalog = service.load()

    image_profile = catalog["services"]["image"]["profiles"][0]
    assert image_profile["binding"] == "openrouter-image"
    assert image_profile["base_url"] == "https://openrouter.ai/api/v1"
    assert image_profile["api_key"] == "test-image-key"
    assert image_profile["models"][0]["model"] == "google/gemini-3.1-flash-image-preview"

    tts_profile = catalog["services"]["tts"]["profiles"][0]
    assert tts_profile["binding"] == "elevenlabs-tts"
    assert tts_profile["base_url"] == "https://api.elevenlabs.io/v1"
    assert tts_profile["api_key"] == "test-tts-key"
    assert tts_profile.get("default_voice") == "Rachel"
    assert tts_profile["models"][0]["model"] == "elevenlabs-multilingual-v2"
    assert tts_profile["models"][0].get("voice") == "Rachel"

    asr_profile = catalog["services"]["asr"]["profiles"][0]
    assert asr_profile["binding"] == "openai-asr"
    assert asr_profile["base_url"] == "https://api.openai.com/v1"
    assert asr_profile["api_key"] == "test-asr-key"
    assert asr_profile["models"][0]["model"] == "whisper-1"


def test_load_syncs_image_tts_asr_active_profiles_from_env(tmp_path: Path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "IMAGE_BINDING=dashscope-image",
                "IMAGE_MODEL=qwen2.5-vl-72b",
                "IMAGE_API_KEY=new-image-key",
                "IMAGE_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1",
                "TTS_BINDING=openai-tts",
                "TTS_MODEL=tts-1-hd",
                "TTS_API_KEY=new-tts-key",
                "TTS_URL=https://api.openai.com/v1",
                "ASR_BINDING=openai-asr",
                "ASR_MODEL=whisper-1",
                "ASR_API_KEY=new-asr-key",
                "ASR_HOST=https://api.openai.com/v1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {
      "active_profile_id": "llm-profile-default",
      "active_model_id": "llm-model-default",
      "profiles": [
        {
          "id": "llm-profile-default",
          "name": "Default LLM Endpoint",
          "binding": "openai",
          "base_url": "",
          "api_key": "",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {"id": "llm-model-default", "name": "Default Model", "model": ""}
          ]
        }
      ]
    },
    "embedding": {
      "active_profile_id": "embedding-profile-default",
      "active_model_id": "embedding-model-default",
      "profiles": [
        {
          "id": "embedding-profile-default",
          "name": "Default Embedding Endpoint",
          "binding": "openai",
          "base_url": "",
          "api_key": "",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {
              "id": "embedding-model-default",
              "name": "Default Embedding Model",
              "model": "",
              "dimension": ""
            }
          ]
        }
      ]
    },
    "image": {
      "active_profile_id": "image-profile-default",
      "active_model_id": "image-model-default",
      "profiles": [
        {
          "id": "image-profile-default",
          "name": "Default Image Endpoint",
          "binding": "openai-image",
          "base_url": "https://old-image.example/v1",
          "api_key": "old-image-key",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {"id": "image-model-default", "name": "old-model", "model": "old-model"}
          ]
        }
      ]
    },
    "tts": {
      "active_profile_id": "tts-profile-default",
      "active_model_id": "tts-model-default",
      "profiles": [
        {
          "id": "tts-profile-default",
          "name": "Default TTS Endpoint",
          "binding": "openai-tts",
          "base_url": "https://old-tts.example/v1",
          "api_key": "old-tts-key",
          "api_version": "",
          "extra_headers": {},
          "default_voice": "old-voice",
          "models": [
            {
              "id": "tts-model-default",
              "name": "old-tts",
              "model": "old-tts",
              "voice": "old-voice"
            }
          ]
        }
      ]
    },
    "asr": {
      "active_profile_id": "asr-profile-default",
      "active_model_id": "asr-model-default",
      "profiles": [
        {
          "id": "asr-profile-default",
          "name": "Default ASR Endpoint",
          "binding": "openai-asr",
          "base_url": "https://old-asr.example/v1",
          "api_key": "old-asr-key",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {"id": "asr-model-default", "name": "old-asr", "model": "old-asr"}
          ]
        }
      ]
    },
    "search": {"active_profile_id": null, "profiles": []}
  }
}
""",
        encoding="utf-8",
    )

    env_store = EnvStore(path=env_path)
    monkeypatch.setattr(model_catalog_module, "get_env_store", lambda: env_store)

    service = ModelCatalogService(path=catalog_path)
    catalog = service.load()

    image_profile = catalog["services"]["image"]["profiles"][0]
    image_model = image_profile["models"][0]
    assert image_profile["binding"] == "dashscope-image"
    assert image_profile["base_url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert image_profile["api_key"] == "new-image-key"
    assert image_model["model"] == "qwen2.5-vl-72b"
    assert image_model["name"] == "qwen2.5-vl-72b"

    tts_profile = catalog["services"]["tts"]["profiles"][0]
    tts_model = tts_profile["models"][0]
    assert tts_profile["binding"] == "openai-tts"
    assert tts_profile["base_url"] == "https://api.openai.com/v1"
    assert tts_profile["api_key"] == "new-tts-key"
    assert tts_model["model"] == "tts-1-hd"
    assert tts_model["name"] == "tts-1-hd"
    # voice not in env_values, so unchanged from old catalog
    assert tts_model["voice"] == "old-voice"

    asr_profile = catalog["services"]["asr"]["profiles"][0]
    asr_model = asr_profile["models"][0]
    assert asr_profile["binding"] == "openai-asr"
    assert asr_profile["base_url"] == "https://api.openai.com/v1"
    assert asr_profile["api_key"] == "new-asr-key"
    assert asr_model["model"] == "whisper-1"
    assert asr_model["name"] == "whisper-1"
