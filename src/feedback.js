/*
 * 진단·미니·종합 피드백에서 사용하는 문장 원본과 생성 규칙.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ 주의 — 이 파일의 약 40%는 현재 화면에 노출되지 않는다.               │
 * │                                                                     │
 * │ [화면에 나옴]   comboInsights · requiresLabel · requiresGloss       │
 * │ [화면에 안 나옴] decisionPurposes · quotedJosa · rationaleMatrix ·  │
 * │                 taskMatrix · relationMatrix · buildChoiceFeedback   │
 * │                                                                     │
 * │ 뒤쪽 묶음은 '결정별 피드백 카드'를 위해 작성됐으나 렌더 코드가 없어  │
 * │ 객체만 만들어지고 버려진다. 문장을 고쳐도 화면은 바뀌지 않으므로     │
 * │ 콘텐츠 검토·수정 대상에서 제외할 것. 각 구간에 표시해 두었다.        │
 * └─────────────────────────────────────────────────────────────────────┘
 */
(function () {
  "use strict";

  var D = window.TKI;

  // [화면 미노출] 결정 지점의 목적. 아래에서 scenario.beat*.purpose로 붙지만 읽는 코드가 없다.
  var decisionPurposes = {
    1: "초기 쟁점 정의와 대응 방향 선택",
    2: "상대의 반응과 추가 제약을 반영한 대응 조정",
    3: "담당자·범위·기한 등 실행 조건 확정",
  };

  D.decisionPurposes = decisionPurposes;

  // [화면 노출] 상위 두 유형을 엮은 결과 심층 해석. key는 order 순서로 정렬한 두 유형(예: "competing+avoiding").
  // app.js renderBrief가 백분위 상위 2개 유형으로 조회해 브리핑에 노출한다.
  D.comboInsights = {
    "competing+collaborating":
      "방향을 빨리 정하는 힘과, 상대 관점까지 끌어와 답을 다듬는 힘이 같이 움직이는 조합입니다. 밀고 나가면서도 여러 의견을 모을 줄 알아서 어려운 일도 실제로 굴러가게 만듭니다. 다만 <b>지금 정해야 한다</b>와 <b>더 이야기해 봐야 한다</b>가 한자리에서 부딪히면 스스로 속도 조절이 힘들어집니다. 이번 연습에서는 어떤 일에 바로 결론을 내고 어떤 일에 논의를 여는지, 그 갈림길의 기준을 살펴보세요.",
    "competing+compromising":
      "원하는 걸 분명히 말하되, 교착되면 현실적인 중간에서 빨리 매듭짓는 조합입니다. 결정을 오래 끌지 않고 양쪽이 받아들일 선에서 일을 진전시킵니다. 다만 절충을 서두르다 보면 원칙이나 품질처럼 <b>절대 내주면 안 되는 것</b>까지 거래 대상이 될 수 있습니다. 이번 연습에서는 무엇을 바꿔줄 수 있고 무엇은 끝까지 지킬지 먼저 구분하고 갈등관리를 시작해보세요.",
    "competing+avoiding":
      "중요한 일에는 세게 밀어붙이고 그 밖에는 한발 물러서는, 개입의 폭이 큰 조합입니다. 힘을 쏟을 데와 아낄 데를 <b>가려내는 판단</b>이 강점입니다. 다만 그 사이의 중간 톤이 얇습니다. 가볍게 물어보거나 슬쩍 조율하는 대응이 적어서, 상대는 당신이 언제 나설지 예측하기 어렵습니다. 이번 연습에서는 정면으로 다룰 일과 미룰 일을 어떤 기준으로 가르는지, 그리고 그 사이를 잇는 부드러운 한마디를 시도해 보세요.",
    "competing+accommodating":
      "어떤 때는 세게 밀고 어떤 때는 크게 양보하는, 양극을 오가는 조합입니다. 일과 상대에 따라 태도를 바꾸는 유연함이 강점입니다. 다만 언제 밀고 언제 물러설지 <b>내 기준</b>이 흐리면 상대에게는 일관성이 없어 보입니다. 이번 연습에서는 그 기준이 일의 무게인지 관계의 부담인지 살펴보세요.",
    "collaborating+compromising":
      "같이 더 나은 답을 찾으려 하되, 시간이 부족하면 현실적인 합의로 부드럽게 내려앉는 조합입니다. 이상과 현실 사이에서 실제로 굴러가는 답을 만들어냅니다. 다만 정말 <b>같이 풀어야 할 일</b>까지 서둘러 절충으로 덮으면 더 나은 답을 놓칩니다. 이번 연습에서는 끝까지 함께 풀 문제와 적당히 나눠도 될 문제를 어떻게 가르는지 살펴보세요.",
    "collaborating+avoiding":
      "충분히 이야기해 풀고 싶어 하면서도, 분위기가 달아오르면 한발 물러서 때를 고르는 조합입니다. 감정이 상하기 전에 멈출 줄 알고, 이야기할 조건이 됐을 때 다시 여는 신중함이 강점입니다. 다만 <b>더 이야기해 보자</b>와 <b>지금은 아니다</b>가 겹치면 결정이 계속 뒤로 밀립니다. 이번 연습에서는 미루는 게 준비를 위한 것인지 부담을 피하는 것인지 살펴보세요.",
    "collaborating+accommodating":
      "상대의 사정을 깊이 살피고 관계를 가장 소중히 여기는 조합입니다. 상대가 존중받는다고 느끼게 해서 협력의 바탕이 되는 신뢰를 얻습니다. 다만 배려가 앞서다 보면 내 입장과 일의 기준을 분명히 말해야 할 순간을 놓칩니다. 이번 연습에서는 상대를 세워주면서 <b>내 몫</b>도 같이 올려놓을 지점이 어디인지 살펴보세요.",
    "compromising+avoiding":
      "정면으로 부딪치지 않으면서 적당한 선에서 빨리 매듭짓는, 마찰을 줄이려는 조합입니다. 괜한 소모전을 줄이고 상황을 매끄럽게 넘깁니다. 다만 원인을 다루지 않고 <b>겉만 덮으면</b> 같은 문제가 되풀이됩니다. 이번 연습에서는 지금 덮어도 될 일과 한 번은 짚고 넘어가야 할 일을 어떻게 가르는지 살펴보세요.",
    "compromising+accommodating":
      "관계를 지키면서 서로 조금씩 양보해 원만하게 마무리하려는 조합입니다. 분위기를 부드럽게 유지하고 앙금을 남기지 않습니다. 다만 양보가 습관이 되면 나에게 <b>중요한 몫</b>까지 내주고 뒤늦게 알아차립니다. 이번 연습에서는 무엇을 기꺼이 내주고 무엇은 지킬지 스스로 정하고 있는지 살펴보세요.",
    "avoiding+accommodating":
      "갈등을 정면으로 다루기보다 물러서거나 맞춰주며 마찰을 피하는, 가장 부딪히지 않는 조합입니다. 평온을 지키고 급한 충돌을 누그러뜨립니다. 다만 내 입장이 자꾸 뒤로 밀리면 필요한 문제 제기나 <b>선 긋기</b>가 늦어집니다. 이번 연습에서는 평온을 지키는 것과 할 말을 하는 것 사이에서 어디에 무게를 두는지 살펴보세요.",
  };

  // 각 시나리오가 요구하는 대응(requires)의 쉬운 풀이. 피드백에서 강조되는 단어의 뜻을 바로 알 수 있게 한다.
  // [화면 노출] 미니 피드백 '실습 결과 종합 해석'에서만 쓰는 풀어쓴 라벨.
  // 짧은 라벨(유예·관계 …)만으로는 유형 이름과 헷갈린다는 자문 의견을 반영한 것.
  D.requiresLabel = {
    "빠른 결론": "빠른 결론 내기",
    "공동 해법": "공동 해법 찾기",
    "양보": "서로 조금씩 양보하기",
    "보류": "잠시 보류하기",
    "관계": "관계 지키기",
  };

  // [화면 노출] 요구 라벨의 뜻풀이. 라벨 바로 뒤에 이어 붙는다.
  D.requiresGloss = {
    "빠른 결론": "지체 없이 결론과 방향을 정해 실행으로 옮기는 것",
    "공동 해법": "양쪽의 요구를 모두 살리는 해법을 함께 찾는 것",
    "양보": "서로 조금씩 양보해 실행 가능한 중간안을 만드는 것",
    "보류": "지금 부딪히기보다 시점을 미뤄 상황 악화를 막는 것",
    "관계": "상대를 인정하고 신뢰와 관계를 지키는 것",
  };

  /* ══════════════════════════════════════════════════════════════════════
     [화면 미노출] 여기부터 파일 끝까지 — 결정별 피드백 카드용 문구와 조립 로직.

     buildChoiceFeedback()이 로드 시점에 선택지 183개 전부에 피드백 객체를 붙이지만,
     그 안의 어떤 필드도 화면에 렌더되지 않는다. app.js는 이 객체를 경로 기록에
     복사만 하고(331행) 피드백 화면을 만들 때 한 번 더 복사할 뿐(490행) 내용을
     꺼내 쓰지 않는다. profiles.js의 authorityNote도 이 객체에만 기록된다.

     살리려면 app.js 피드백 화면에 렌더 코드를 붙이면 된다. 다만 아래 30문장은
     강사 검토를 받은 적이 없으므로 화면에 올리기 전에 검토가 선행되어야 한다.
     ══════════════════════════════════════════════════════════════════════ */

  function quotedJosa(text, withBatchim, withoutBatchim) {
    var last = String(text).charCodeAt(String(text).length - 1);
    var hasBatchim = last >= 0xac00 && last <= 0xd7a3 && ((last - 0xac00) % 28 !== 0);
    return "'" + text + "'" + (hasBatchim ? withBatchim : withoutBatchim);
  }

  // fit × 단계별 해설·영향 템플릿. 세 결정은 항상 서로 다른 단계이므로 카드마다 다르게 읽힌다.
  // [stage1, stage2, stage3] 순. {L}=선택 유형 라벨, {R}=요구 조사형(을/를), {RW}=요구 조사형(과/와)으로 치환.
  var rationaleMatrix = {
    good: [
      "첫 결정에서 {L} 방식으로 {R} 분명한 말과 행동으로 옮겨, 대화의 방향과 기준을 세운 선택입니다.",
      "상대가 새 제약을 내놓은 국면에서 {L} 방식으로 {R} 놓치지 않고 대응을 조정한 선택입니다. 흔들릴 수 있는 지점에서 상황의 요구를 지켜냈습니다.",
      "실행 조건을 정하는 마지막 국면에서 {L} 방식으로 {R} 담당·범위·기한에까지 반영해 마무리한 선택입니다.",
    ],
    ok: [
      "첫 결정에서 {L} 방식으로 대화의 물꼬는 텄지만, {R} 절반만 반영해 방향이 다소 느슨하게 남은 선택입니다.",
      "새 제약이 등장한 국면에서 {L} 방식으로 큰 마찰 없이 넘겼지만, {R} 더 살릴 여지를 남긴 선택입니다.",
      "마무리 국면에서 {L} 방식으로 대화는 닫았지만, 실행 조건에서 {R} 끝까지 못 박지 않아 후속 조정이 남을 수 있는 선택입니다.",
    ],
    poor: [
      "첫 방향을 정하는 국면에서 {L} 방식이 이 장면의 {RW} 어긋나, 쟁점 정의부터 다른 곳을 향한 선택입니다.",
      "상대가 새 제약을 낸 국면에서 {L} 방식은 {RW} 거리가 있어, 조정이 필요한 순간을 살리지 못한 선택입니다.",
      "실행 조건을 정하는 국면에서 {L} 방식이 {RW} 멀어져, 담당·기한·범위가 불분명하게 남을 수 있는 선택입니다.",
    ],
  };
  var taskMatrix = {
    good: [
      " 초기 방향을 실행 가능한 형태로 잡아 이후 논의의 토대를 만듭니다.",
      " 새 제약을 반영해 조정하면서도 실행 가능성을 유지합니다.",
      " 실행 조건까지 구체화해 합의의 이행력을 높입니다.",
    ],
    ok: [
      " 방향은 열었지만 핵심 조건을 더 못 박아야 다음 단계가 헐거워지지 않습니다.",
      " 진행은 유지되나 남은 제약을 명확히 하지 않으면 후속 조정이 필요합니다.",
      " 마무리는 됐지만 담당·기한 중 일부가 확정되지 않으면 재논의가 생길 수 있습니다.",
    ],
    poor: [
      " 첫 방향이 어긋나 이후 단계에서 쟁점을 다시 잡아야 할 수 있습니다.",
      " 조정이 필요한 국면을 놓쳐 제약이 그대로 남을 수 있습니다.",
      " 실행 조건이 흐려져 일정·품질·책임 중 하나가 불분명하게 남을 수 있습니다.",
    ],
  };
  var relationMatrix = {
    good: [
      " 상대가 대화를 이어갈 근거를 얻어 참여 의지가 높아집니다.",
      " 제약을 존중하며 조정해 상대의 신뢰를 유지합니다.",
      " 합의 조건이 분명해져 상대도 이행에 대한 예측이 쉬워집니다.",
    ],
    ok: [
      " 큰 충돌은 없지만 상대의 핵심 우려가 남았는지 확인이 필요합니다.",
      " 마찰은 피했으나 상대가 충분히 반영됐다고 느끼는지는 별개입니다.",
      " 관계는 유지되나 미해결 항목이 나중에 앙금으로 남을 수 있습니다.",
    ],
    poor: [
      " 의도를 설명하지 않으면 상대가 처음부터 배제됐다고 느낄 수 있습니다.",
      " 상대는 새로 낸 제약이 무시됐다고 받아들일 수 있습니다.",
      " 마무리 단계의 어긋남이 상대에게 앙금으로 남을 수 있습니다.",
    ],
  };

  function fillTemplate(text, label, reqEul, reqGwa) {
    return text.replace(/\{L\}/g, label).replace(/\{RW\}/g, reqGwa).replace(/\{R\}/g, reqEul);
  }

  function buildChoiceFeedback(choice, scenario, stage) {
    var chosen = D.types[choice.mode];
    var target = D.types[scenario.target];
    var idx = stage - 1;
    var reqEul = quotedJosa(scenario.requires, "을", "를");
    var reqGwa = quotedJosa(scenario.requires, "과", "와");
    var fit = choice.fit === "good" || choice.fit === "poor" ? choice.fit : "ok";
    var rationale = fillTemplate(rationaleMatrix[fit][idx], chosen.label, reqEul, reqGwa);
    var taskSuffix = taskMatrix[fit][idx];
    var relationshipSuffix = relationMatrix[fit][idx];

    return {
      purpose: decisionPurposes[stage],
      rationale: rationale,
      taskEffect: chosen.taskImpact + taskSuffix,
      relationshipEffect: chosen.relationshipImpact + relationshipSuffix,
      risk: chosen.overuseRisk,
      nextFocus: target.watch,
      recommendedMode: scenario.target,
    };
  }

  Object.keys(D.scenarios).forEach(function (key) {
    var scenario = D.scenarios[key];
    scenario.beat1.purpose = decisionPurposes[1];
    scenario.beat1.choices.forEach(function (choice) {
      choice.feedback = buildChoiceFeedback(choice, scenario, 1);
    });
    Object.keys(scenario.beat2).forEach(function (node) {
      scenario.beat2[node].purpose = decisionPurposes[2];
      scenario.beat2[node].choices.forEach(function (choice) {
        choice.feedback = buildChoiceFeedback(choice, scenario, 2);
      });
    });
    scenario.beat3.purpose = decisionPurposes[3];
    scenario.beat3.choices.forEach(function (choice) {
      choice.feedback = buildChoiceFeedback(choice, scenario, 3);
    });
  });
})();
