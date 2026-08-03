/*
 * 진단·미니·종합 피드백에서 사용하는 문장 원본과 생성 규칙.
 * 시나리오 선택지에는 로드 시점에 결정별 피드백 메타데이터를 결합한다.
 */
(function () {
  "use strict";

  var D = window.TKI;
  var decisionPurposes = {
    1: "초기 쟁점 정의와 대응 방향 선택",
    2: "상대의 반응과 추가 제약을 반영한 대응 조정",
    3: "담당자·범위·기한 등 실행 조건 확정",
  };

  D.decisionPurposes = decisionPurposes;
  D.feedback = {
    fitLabels: {
      good: "상황에 잘 맞은 선택",
      ok: "무난한 선택",
      poor: "아쉬운 선택",
    },
    flexibility: {
      one: [
        "세 결정에서 한 가지 방식을 일관되게 사용했습니다.",
        "상황 변화에도 같은 전략을 유지한 점은 강점이 될 수 있습니다.",
        "다른 대응으로 전환할 단서를 놓치지 않았는지 확인해보세요.",
      ],
      two: [
        "상대의 반응에 따라 두 가지 대응 방식을 오가며 조정했습니다.",
        "전략을 바꾼 시점이 실제 상황 단서와 맞았는지 살펴보세요.",
      ],
      varied: [
        "세 결정에서 서로 다른 대응 방식을 사용했습니다.",
        "대응 레퍼토리는 넓었지만, 상황에 근거한 조정이었는지 확인해보세요.",
      ],
    },
  };

  // 상위 두 유형을 엮은 결과 심층 해석. key는 order 순서로 정렬한 두 유형(예: "competing+avoiding").
  // app.js renderBrief가 점수 상위 2개 유형으로 조회해 브리핑에 노출한다.
  D.comboInsights = {
    "competing+collaborating":
      "방향을 빠르게 세우려는 힘과, 상대의 관점까지 끌어와 해법의 완성도를 높이려는 힘이 함께 작동하는 조합입니다. 추진력과 통합력을 겸비해, 어려운 문제도 실제로 굴러가게 만드는 강점이 있습니다. 다만 '지금 결론을 내야 한다'와 '충분히 논의해야 한다'가 한 상황에서 부딪히면, 스스로 속도 조절에 부담을 느끼기 쉽습니다. 이번 연습에서는 어떤 사안에 결단을 먼저 놓고 어떤 사안에 논의를 여는지, 그 갈림의 기준을 관찰해 보면 좋습니다.",
    "competing+compromising":
      "원하는 결과를 분명히 하되, 교착되면 현실적인 중간 지점으로 빠르게 매듭짓는 실행력 높은 조합입니다. 결정을 오래 끌지 않고 양측이 받아들일 만한 선에서 상황을 진전시키는 힘이 있습니다. 다만 절충을 서두르다 보면 원칙이나 품질처럼 <b>양보해선 안 될 기준</b>까지 거래 대상으로 넘어갈 위험이 있습니다. 이번 연습에서는 무엇이 교환 가능한 조건이고 무엇이 끝까지 지킬 선인지, 그 경계를 먼저 그어 보면 좋습니다.",
    "competing+avoiding":
      "중요한 사안에는 강하게 밀어붙이지만 그 외에는 한발 물러서 거리를 두는, 개입 강도의 진폭이 큰 조합입니다. 힘을 쏟을 데와 아낄 데를 <b>선택·집중</b>하는 판단이 강점입니다. 다만 밀어붙임과 침묵 사이의 중간 톤 — 가볍게 묻거나 조율하는 대응 — 이 얇아서, 상대는 당신이 언제 나설지 예측하기 어려워할 수 있습니다. 이번 연습에서는 정면으로 다룰 사안과 잠시 미룰 사안을 어떤 기준으로 가르는지, 그리고 그 사이를 잇는 부드러운 대응을 시도해 보면 좋습니다.",
    "competing+accommodating":
      "상황에 따라 강하게 주도하기도 하고, 반대로 크게 양보하기도 하는 양극을 오가는 조합입니다. 사안과 상대에 맞춰 태도를 바꾸는 유연함은 분명한 강점입니다. 다만 언제 밀고 언제 물러설지에 대한 <b>자신만의 기준</b>이 흐리면, 상대에게는 일관성이 없다는 인상으로 비칠 수 있습니다. 이번 연습에서는 주도와 양보를 가르는 기준이 사안의 무게인지 관계의 부담인지, 그 결을 관찰해 보면 좋습니다.",
    "collaborating+compromising":
      "함께 더 나은 답을 찾으려 하되, 시간이 부족하면 현실적인 합의로 부드럽게 착지시키는 균형 잡힌 조합입니다. 이상과 현실 사이에서 실제로 실행 가능한 해법을 만들어내는 힘이 있습니다. 다만 정말 <b>통합이 필요한 사안</b>까지 절충으로 서둘러 봉합하면, 더 나은 답을 찾을 기회를 놓칠 수 있습니다. 이번 연습에서는 끝까지 함께 풀어야 할 문제와 적당히 나눠도 될 문제를 어떻게 구분하는지 관찰해 보면 좋습니다.",
    "collaborating+avoiding":
      "충분히 대화해 풀고 싶어 하면서도, 갈등이 과열되면 한발 물러서 시점을 고르는 신중한 조합입니다. 감정이 상하기 전에 멈출 줄 알고, 대화의 조건이 무르익었을 때 다시 여는 사려 깊음이 강점입니다. 다만 '더 논의해보자'와 '지금은 아니다'가 겹치면, 결정이 계속 뒤로 밀려 실행이 지연될 수 있습니다. 이번 연습에서는 미루는 것이 준비를 위한 유예인지 부담을 피하는 회피인지, 그 경계를 살펴보면 좋습니다.",
    "collaborating+accommodating":
      "상대의 필요를 깊이 살피고 관계를 무엇보다 소중히 여기는, 관계 지향이 뚜렷한 조합입니다. 상대가 존중받는다고 느끼게 하고 협력의 바탕이 되는 신뢰를 얻는 힘이 큽니다. 다만 배려가 앞서다 보면, 자신의 입장과 과업 기준을 분명히 제시해야 할 순간을 놓치기 쉽습니다. 이번 연습에서는 상대를 세워주면서도 자신의 몫을 함께 올려놓을 지점이 어디인지 관찰해 보면 좋습니다.",
    "compromising+avoiding":
      "정면충돌은 피하면서 적당한 선에서 빠르게 매듭짓는, 마찰을 최소화하려는 조합입니다. 불필요한 소모전을 줄이고 상황을 매끄럽게 넘기는 데 능합니다. 다만 근본 원인을 다루기보다 <b>표면만 봉합</b>하고 넘어가면, 같은 문제가 되풀이될 수 있습니다. 이번 연습에서는 지금 덮어도 되는 사안과 한 번은 정면으로 짚어야 할 사안을 어떻게 가르는지 살펴보면 좋습니다.",
    "compromising+accommodating":
      "관계를 지키면서 서로 조금씩 양보해 원만하게 마무리하려는 조합입니다. 분위기를 부드럽게 유지하고 상대와의 앙금을 남기지 않는 힘이 있습니다. 다만 양보가 습관이 되면, 자신에게 <b>중요한 몫</b>까지 내주고도 뒤늦게 깨닫게 될 수 있습니다. 이번 연습에서는 무엇을 기꺼이 내주고 무엇은 지켜야 하는지, 그 선을 스스로 정하고 있는지 관찰해 보면 좋습니다.",
    "avoiding+accommodating":
      "갈등을 정면으로 다루기보다 물러서거나 맞춰주며 마찰을 피하는, 가장 비대립적인 조합입니다. 관계의 평온을 지키고 급한 충돌을 누그러뜨리는 힘이 있습니다. 다만 자신의 입장이 반복해서 뒤로 밀리면, 필요한 문제 제기나 <b>선 긋기</b>가 자꾸 늦어질 수 있습니다. 이번 연습에서는 평온을 지키는 것과 할 말을 하는 것 사이에서 어디에 무게를 두는지 관찰해 보면 좋습니다.",
  };

  // 각 시나리오가 요구하는 대응(requires)의 쉬운 풀이. 피드백에서 강조되는 단어의 뜻을 바로 알 수 있게 한다.
  D.requiresGloss = {
    "속도": "지체 없이 결론과 방향을 정해 실행으로 옮기는 것",
    "통합": "양쪽의 요구를 모두 살리는 해법을 함께 찾는 것",
    "절충": "서로 조금씩 양보해 실행 가능한 중간안을 만드는 것",
    "유예": "지금 부딪히기보다 시점을 미뤄 상황 악화를 막는 것",
    "관계": "상대를 인정하고 신뢰와 관계를 지키는 것",
  };

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
