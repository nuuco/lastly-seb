from fastapi import APIRouter, Depends, HTTPException, status

from lastly_ai.api.deps import CadenceDep, EmbeddingsDep, NormalizerDep, verify_internal_token
from lastly_ai.schemas.capture import (
    CadenceRequest,
    CadenceResponse,
    EmbedRequest,
    EmbedResponse,
    ParseRequest,
    ParseResponse,
)

router = APIRouter(dependencies=[Depends(verify_internal_token)])


@router.post("/parse", response_model=ParseResponse)
async def parse(req: ParseRequest, normalizer: NormalizerDep) -> ParseResponse:
    """자연어 한 문장 → 항목 이름 + 수행 날짜 + 기존 항목 연결."""
    return await normalizer.parse(req)


@router.post("/cadence/suggest", response_model=CadenceResponse)
async def suggest_cadence(req: CadenceRequest, cadence: CadenceDep) -> CadenceResponse:
    """개인 이력이 충분하면 거기서 학습하고, 아니면 일반적인 주기를 제안한다."""
    return await cadence.suggest(req)


@router.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest, embeddings: EmbeddingsDep) -> EmbedResponse:
    vector = await embeddings.embed(req.text)
    if vector is None:
        # 임베딩 제공자가 없으면 apps/api 가 임베딩 없이 진행하도록 알린다.
        #
        # 503 을 쓰면 안 된다. 무료 호스팅은 잠든 컨테이너에도 503 을 내려서
        # apps/api 가 "깨어나는 중" 으로 보고 45초 동안 다시 부른다.
        # 이건 기다려도 달라지지 않는 상태이므로 501 로 알린다.
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED, "임베딩 제공자가 설정되지 않았습니다."
        )
    return EmbedResponse(embedding=vector)
