from functools import lru_cache

from app.config import get_settings

EMBEDDING_DIMENSION = 512


@lru_cache(maxsize=1)
def load_model():
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import LocalEntryNotFoundError
    from sentence_transformers import SentenceTransformer

    settings = get_settings()
    try:
        source = snapshot_download(
            settings.embedding_model,
            revision=settings.embedding_model_revision,
            local_files_only=True,
        )
    except LocalEntryNotFoundError:
        source = settings.embedding_model
    model = SentenceTransformer(
        source, revision=settings.embedding_model_revision, device="cpu"
    )
    if model.get_sentence_embedding_dimension() != EMBEDDING_DIMENSION:
        raise ValueError("Embedding model dimension must be 512")
    return model


def embed_texts(texts: list[str]) -> dict:
    model = load_model()
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return {
        "model": f"{get_settings().embedding_model}@{get_settings().embedding_model_revision}",
        "dimension": EMBEDDING_DIMENSION,
        "vectors": vectors.tolist(),
    }
