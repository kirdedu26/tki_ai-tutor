/*
 * TKI v3 — 선택지 분기형 갈등 코치 (앱 로직)
 * 단일 IIFE. 상태는 메모리에만 존재하며, 세션 시작·완료 시 익명 결과만 교수자 대시보드로 전송한다(tkiSend/tkiSendStart).
 *
 * 분기 엔진: 전체 트리를 미리 두지 않고, "상대 심리 상태"를 상태값으로 들고
 * 직전 선택의 적합도(fit)에 따라 상대 반응·심리 이동·결말을 런타임에 조립한다.
 */
(function () {
  "use strict";

  var D = window.TKI;
  var C = D.copy;
  var root = document.getElementById("root");

  /* ------------------------------- 상태 ------------------------------- */
  var state = {
    phase: "onboarding", // onboarding | profile | tie | brief | practice | feedback | round | summary
    form: { competing: 50, collaborating: 50, compromising: 50, avoiding: 50, accommodating: 50 },
    scores: null,
    highest: [],
    lowest: [],
    profileDraft: { job: null, projectRole: null, recentOpponent: null },
    profile: null,
    completed: 0,
    usedTypes: [],
    usedOpponents: [],
    history: [], // 완료된 실습 [{target, opponentType, path, endingKey}]
    current: null,
    pendingTarget: null, // 동점 선택 대기용
  };
  var practiceTimer = null;
  var practiceAnimationToken = 0;
  var lastRenderedPhase = null;
  var pendingFocusSelector = null;

  var profileOptions = D.profiles.options;

  /* ------------------------------- 유틸 ------------------------------- */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function fitVal(fit) {
    return fit === "good" ? 1 : fit === "poor" ? -1 : 0;
  }
  function josa(text, withBatchim, withoutBatchim) {
    var value = String(text);
    var last = value.charCodeAt(value.length - 1);
    var hasBatchim = last >= 0xac00 && last <= 0xd7a3 && ((last - 0xac00) % 28 !== 0);
    return value + (hasBatchim ? withBatchim : withoutBatchim);
  }
  // (으)로 전용 조사. 받침 없음 또는 ㄹ 받침이면 '로', 그 외 받침이면 '으로'.
  function josaRo(text) {
    var value = String(text);
    var last = value.charCodeAt(value.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return value + "로";
    var jong = (last - 0xac00) % 28;
    return value + (jong === 0 || jong === 8 ? "로" : "으로");
  }
  function quotedJosa(text, withBatchim, withoutBatchim) {
    var value = String(text);
    var last = value.charCodeAt(value.length - 1);
    var hasBatchim = last >= 0xac00 && last <= 0xd7a3 && ((last - 0xac00) % 28 !== 0);
    return "'" + value + "'" + (hasBatchim ? withBatchim : withoutBatchim);
  }
  function firstSentence(text) {
    var value = String(text || "").trim();
    var match = value.match(/^.*?[.!?](?:\s|$)/);
    return match ? match[0].trim() : value;
  }
  function splitSentences(text) {
    var value = String(text || "").trim();
    return (value.match(/[^.!?]+(?:[.!?]+["'”’」』]?|$)/g) || [value]).map(function (sentence) {
      return sentence.trim();
    }).filter(Boolean);
  }
  function stripOuterQuotes(text) {
    return String(text || "").trim()
      .replace(/^["'“”‘’「」『』]+/, "")
      .replace(/["'“”‘’「」『』]+$/, "")
      .trim();
  }
  function emphasizeLead(text) {
    var value = String(text || "");
    var match = value.match(/^([^:]{1,36}):\s*(.+)$/);
    if (!match) return esc(value);
    return '<strong class="point-key">' + esc(match[1]) + ":</strong> " + esc(match[2]);
  }
  function pointList(items, className) {
    return '<ul class="' + (className || "readable-points") + '">' +
      items.map(function (item) { return "<li>" + emphasizeLead(item) + "</li>"; }).join("") +
      "</ul>";
  }
  // 여러 문장이 이어진 문자열을 문장 단위로 쪼개 각각 <p>로 감싼다.
  // (한 <p>에 여러 문장을 넣으면 마침표 뒤에서 줄이 나뉘지 않아 뭉쳐 보이는 문제 해결)
  // 문장 안의 <b> 등 인라인 태그는 마침표를 포함하지 않으므로 분할에 영향받지 않는다.
  function proseParas(html, className) {
    var attr = className ? ' class="' + className + '"' : "";
    return splitSentences(html)
      .map(function (sentence) { return "<p" + attr + ">" + sentence + "</p>"; })
      .join("");
  }
  function conciseImpact(fit, before, after) {
    var effect = fit === "good"
      ? "핵심 제약을 직접 다뤄 실행 가능성과 대화 지속성을 높였습니다."
      : fit === "poor"
        ? "과업 조건이 불분명하게 남고 상대의 방어를 키울 위험이 있습니다."
        : "대화는 이어갔지만 핵심 제약과 상대 우려를 추가로 확인할 필요가 있습니다.";
    return "상대 심리: " + before + " → " + after + " / " + effect;
  }
  function stateIndex(name) {
    return D.states.indexOf(name);
  }
  function optionLabel(group, key) {
    var found = profileOptions[group].filter(function (item) { return item.key === key; })[0];
    return found ? found.label : "";
  }
  function profileRoleLabel(profile) {
    if (!profile) return "";
    return profile.job === "research"
      ? optionLabel("job", profile.job) + " · " + optionLabel("projectRole", profile.projectRole)
      : optionLabel("job", profile.job);
  }
  function profileGuidance(profile) {
    var key = profile.job === "administration" ? "administration" : profile.projectRole;
    return D.profiles.guidance[key];
  }

  /* -------------------------- 백분위/랭크 처리 -------------------------- */
  // 입력값은 TKI 결과지의 백분위(0~100). 원점수는 유형마다 문항 가중이 달라
  // 같은 점수라도 실제 발현 정도가 다르므로, 유형 간 비교가 가능한 백분위를 기준으로 삼는다.
  var PCT_MIN = 0, PCT_MAX = 100;
  // TKI 규준 해석 구간: 25 이하 낮음 / 25~75 중간 / 75 이상 높음
  var BAND_LABEL = { high: "높음", mid: "중간", low: "낮음" };
  function clampPct(v) {
    var n = Math.round(Number(v));
    return isNaN(n) ? 50 : Math.max(PCT_MIN, Math.min(PCT_MAX, n));
  }
  function bandKey(p) { return p >= 75 ? "high" : p <= 25 ? "low" : "mid"; }
  function bandLabel(p) { return BAND_LABEL[bandKey(p)]; }
  // 백분위 v = 규준집단의 v%보다 높은 위치
  function percentileNote(v) {
    if (v >= 97) return "거의 맨 위";
    if (v <= 3) return "거의 맨 아래";
    if (v >= 45 && v <= 55) return "딱 중간쯤";
    return v > 55 ? "상위 " + (100 - v) + "%" : "하위 " + v + "%";
  }
  // 다섯 유형 백분위를 평균 내 '갈등 관여 총량'으로 읽지 않는다.
  // TKI는 점수 합이 30으로 고정된 상대 척도(ipsative)라 합산·평균이 의미가 없다(공식 기술문서).
  var OVERUSE_MIN = 90;  // 규준집단 상위 10% 안 — 공식 '높음'(75+) 중에서도 특히 치우친 경우만 따로 짚는다
  var UNDERUSE_MAX = 10; // 규준집단 하위 10% 안 — 공식 '낮음'(25−) 중에서도 특히 치우친 경우

  function formBandCounts() {
    var c = { high: 0, mid: 0, low: 0 };
    D.order.forEach(function (k) { c[bandKey(state.form[k])] += 1; });
    return c;
  }
  function formSpread() {
    var vals = D.order.map(function (k) { return state.form[k]; });
    return Math.max.apply(null, vals) - Math.min.apply(null, vals);
  }

  function computeRanks() {
    var s = state.scores;
    var vals = D.order.map(function (k) { return s[k]; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    state.highest = D.order.filter(function (k) { return s[k] === max; });
    state.lowest = D.order.filter(function (k) { return s[k] === min; });
  }

  // 아직 실습하지 않은 유형 중 백분위가 가장 낮은 유형
  function lowestUnusedType() {
    var s = state.scores;
    var candidates = D.order.filter(function (k) { return state.usedTypes.indexOf(k) < 0; });
    if (!candidates.length) candidates = D.order.slice();
    candidates.sort(function (a, b) { return s[a] - s[b]; });
    return candidates[0];
  }

  /* --------------------------- 실습 시작/진행 --------------------------- */
  function opponentBaseLevel(opponentType, job) {
    var levels = D.profiles.baseLevels[job];
    return levels[opponentType] || levels.default;
  }

  function opponentIdentity(opponentType, job) {
    return D.profiles.identities[job][opponentType];
  }

  function replaceDeep(value, from, to) {
    if (typeof value === "string") return value.split(from).join(to);
    if (Array.isArray(value)) return value.map(function (item) { return replaceDeep(item, from, to); });
    if (value && typeof value === "object") {
      var result = {};
      Object.keys(value).forEach(function (key) { result[key] = replaceDeep(value[key], from, to); });
      return result;
    }
    return value;
  }

  function mapScenarioDialogue(scenario, mapper) {
    scenario.beat1.line = mapper(scenario.beat1.line);
    Object.keys(scenario.beat2).forEach(function (key) {
      scenario.beat2[key].line = mapper(scenario.beat2[key].line);
    });
    scenario.beat3.line = mapper(scenario.beat3.line);
  }

  function adaptLeaderDialogue(scenario) {
    mapScenarioDialogue(scenario, function (text) {
      D.profiles.leaderDialogueReplacements.forEach(function (replacement) {
        text = text.split(replacement[0]).join(replacement[1]);
      });
      return text;
    });
  }

  function adaptMemberAuthority(scenario) {
    scenario.authorityCue = D.profiles.member.authorityCue;
    function adaptChoices(choices) {
      choices.forEach(function (choice) {
        choice.feedback.authorityNote = D.profiles.member.authorityNote;
      });
    }
    adaptChoices(scenario.beat1.choices);
    Object.keys(scenario.beat2).forEach(function (key) { adaptChoices(scenario.beat2[key].choices); });
    adaptChoices(scenario.beat3.choices);
    mapScenarioDialogue(scenario, function (text) {
      D.profiles.member.dialogueReplacements.forEach(function (replacement) {
        text = text.split(replacement[0]).join(replacement[1]);
      });
      return text;
    });
  }

  function personalizeScenario(base, opponentType) {
    var profile = state.profile;
    var identity = opponentIdentity(opponentType, profile.job);
    var scenario = replaceDeep(base, base.opponent.name, identity.name);
    scenario.opponent = identity;
    if (opponentType === "leader") adaptLeaderDialogue(scenario);
    if (profile.job === "research" && profile.projectRole === "member") adaptMemberAuthority(scenario);

    var roleKey = profile.job === "administration" ? "administration" : profile.projectRole;
    var roleContext = D.profiles.roleContexts[roleKey];
    var relationship = josa(identity.name, "은", "는") +
      D.profiles.relationshipSuffixes[opponentType];

    var originalLines = splitSentences(scenario.situation);
    var incident = originalLines.length > 1 ? originalLines.slice(1).join(" ") : originalLines[0];
    scenario.situation = roleContext + " " + relationship + " " + incident;
    scenario.profileContext = profileRoleLabel(profile) + " · 선택 상대: " + optionLabel("opponent", opponentType);
    return scenario;
  }

  function startPractice(target, opponentType) {
    tkiSendStart(); // 첫 실습 진입 시 1회 시작 신호(완료율 분모). 내부 가드로 중복 방지.
    var baseLevel = opponentBaseLevel(opponentType, state.profile.job);
    var key = target + "_" + baseLevel;
    var baseScenario = D.scenarios[key] || D.scenarios[target + "_1"];
    var scenario = personalizeScenario(baseScenario, opponentType);
    if (state.usedTypes.indexOf(target) < 0) state.usedTypes.push(target);
    if (state.usedOpponents.indexOf(opponentType) < 0) state.usedOpponents.push(opponentType);

    state.current = {
      scenarioKey: key,
      scenario: scenario,
      target: target,
      opponentType: opponentType,
      stage: 1,        // 1 = beat1, 2 = beat2, 3 = beat3
      node: null,      // 현재 beat2 노드 키
      stateIdx: stateIndex(scenario.startState),
      startedAt: Date.now(), // 실습 소요 시간 측정 시작점
      path: [],
      messages: [],
      locked: true,
      revealDuration: 0,
      nextPhase: null,
      ended: false,
      endingKey: null,
    };
    // 도입: 상황 + 첫 상대 대사
    state.current.messages.push({ role: "sys", text: scenario.situation, animate: true });
    state.current.messages.push({ role: "opp", text: scenario.beat1.line, animate: true });
    state.phase = "practice";
    render();
  }

  // 적합도에 따른 상대 심리 이동
  function moveState(cur, fit) {
    var idx = cur.stateIdx + fitVal(fit);
    if (idx < 0) idx = 0;
    if (idx > D.states.length - 1) idx = D.states.length - 1;
    cur.stateIdx = idx;
  }

  function currentChoices(cur) {
    if (cur.stage === 1) return cur.scenario.beat1.choices;
    if (cur.stage === 2) return cur.scenario.beat2[cur.node].choices;
    return cur.scenario.beat3.choices;
  }

  // choice = {mode, fit, text, reply, to}
  function applyChoice(choice) {
    var cur = state.current;
    if (cur.locked) return;
    cur.messages.forEach(function (message) { message.animate = false; });
    cur.locked = true;
    cur.focusSkip = true;
    var mode = choice.mode, fit = choice.fit;

    // 학습자 발화
    cur.messages.push({ role: "me", text: choice.text, animate: true });

    // 심리 이동
    var stateBefore = D.states[cur.stateIdx];
    moveState(cur, fit);
    cur.path.push({
      stage: cur.stage,
      node: cur.node,
      mode: mode,
      fit: fit,
      text: choice.text,
      reply: choice.reply || null,   // beat1·beat2는 선택에 맞춘 상대 즉답, beat3는 없음(null)
      stateBefore: stateBefore,
      stateAfter: D.states[cur.stateIdx],
      feedback: choice.feedback || null,
    });

    if (cur.stage === 1) {
      // beat1 → beat2: 선택에 맞는 노드로 분기. 상대 반응(reply)은 선택 내용에 맞춰짐.
      cur.node = choice.to;
      cur.stage = 2;
      var node2 = cur.scenario.beat2[cur.node];
      cur.messages.push({
        role: "opp",
        reaction: choice.reply,
        state: D.states[cur.stateIdx],
        text: node2.line,
        animate: true,
      });
      render();
    } else if (cur.stage === 2) {
      // beat2 → beat3: 앞선 두 선택으로 이동한 심리 상태를 보여주며 실행·합의 단계로 전환.
      cur.stage = 3;
      var reply2 = choice.reply || pick(D.reactions[fit]);
      cur.path[cur.path.length - 1].reply = reply2; // 화면에 표시된 실제 반응을 피드백에서 그대로 인용
      cur.messages.push({
        role: "opp",
        reaction: reply2,
        state: D.states[cur.stateIdx],
        text: cur.scenario.beat3.line,
        animate: true,
      });
      render();
    } else {
      var reaction = pick(D.reactions[fit]);
      cur.path[cur.path.length - 1].reply = reaction; // 결정 3의 상대 마무리 반응도 동일하게 인용
      // 결말 판정
      var endingKey = decideEnding(cur);
      cur.ended = true;
      cur.endingKey = endingKey;
      var ending = D.endings[endingKey];
      cur.messages.push({
        role: "opp",
        reaction: reaction,
        state: D.states[cur.stateIdx],
        text: null,
        animate: true,
      });
      cur.messages.push({ role: "end", endingKey: endingKey, text: ending.text, animate: true });
      // 이력 기록
      state.completed += 1;
      state.history.push({
        scenarioKey: cur.scenarioKey,
        scenario: cur.scenario,
        target: cur.target,
        opponentType: cur.opponentType,
        requires: cur.scenario.requires,
        startState: cur.scenario.startState,
        path: cur.path.slice(),
        endingKey: endingKey,
        durationSec: cur.startedAt ? Math.round((Date.now() - cur.startedAt) / 1000) : null,
      });
      cur.nextPhase = "feedback";
      render();
    }
  }

  function decideEnding(cur) {
    var score = cur.path.reduce(function (a, p) { return a + fitVal(p.fit); }, 0);
    var st = cur.stateIdx; // 0경직 1방어 2중립 3협조
    return endingFromScore(score, st);
  }

  function endingFromScore(score, st) {
    if (score >= 2 || (score >= 1 && st >= 3)) return "resolved";
    if (score === 1) return "partial";
    if (score === 0) return st <= 1 ? "patched" : "partial";
    if (score === -1) return "patched";
    return "stuck";
  }

  /* --------------------------- 미니 피드백 --------------------------- */
  function dominantModes(path) {
    var counts = {};
    path.forEach(function (p) { counts[p.mode] = (counts[p.mode] || 0) + 1; });
    var max = 0;
    Object.keys(counts).forEach(function (m) { if (counts[m] > max) max = counts[m]; });
    return Object.keys(counts).filter(function (m) { return counts[m] === max; });
  }

  function buildMiniFeedback() {
    var cur = state.current;
    var path = cur.path;
    var fb = {};

    // 1. 경로
    fb.path = path.map(function (p, i) {
      return {
        n: i + 1,
        mode: p.mode,
        fit: p.fit,
        label: D.types[p.mode].label,
        stateBefore: p.stateBefore,
        stateAfter: p.stateAfter,
      };
    });
    fb.fitCounts = { good: 0, ok: 0, poor: 0 };
    path.forEach(function (p) { fb.fitCounts[p.fit] += 1; });

    // 2. 나타난 경향
    fb.dominant = dominantModes(path);

    // 3. 대비용 예시 대사 — 적합도가 가장 낮았던(나았던 분기와 겹치지 않는) 결정에서
    //    실제로 고를 수 있었던 상황 적합(good) 보기. altBlock 인용 예시에 쓴다.
    var bestIdx = 0, bestV = fitVal(path[0].fit);
    path.forEach(function (p, i) { if (fitVal(p.fit) > bestV) { bestV = fitVal(p.fit); bestIdx = i; } });
    var worstIdx = -1, worstV = 2;
    path.forEach(function (p, i) {
      var v = fitVal(p.fit);
      if (i !== bestIdx && v < worstV) { worstV = v; worstIdx = i; }
    });
    if (worstIdx < 0) worstIdx = bestIdx; // 결정 지점이 하나뿐인 경우
    var worstItem = path[worstIdx];
    var altChoices = worstItem.stage === 1
      ? cur.scenario.beat1.choices
      : worstItem.stage === 2
        ? cur.scenario.beat2[worstItem.node].choices
        : cur.scenario.beat3.choices;
    var altChoice = altChoices.filter(function (c) { return c.fit === "good"; })[0] || altChoices[0];
    fb.worst = { n: worstIdx + 1, alt: altChoice };

    return fb;
  }

  /* --------------------------- 종합 피드백 --------------------------- */
  function buildSummary() {
    var allPath = [];
    var fitCounts = { good: 0, ok: 0, poor: 0 };
    var modeCounts = {};
    var axes = {
      competing: { task: 2, relation: 0 },
      collaborating: { task: 2, relation: 2 },
      compromising: { task: 1, relation: 1 },
      avoiding: { task: 0, relation: 0 },
      accommodating: { task: 0, relation: 2 },
    };
    var taskSum = 0, relationSum = 0;

    state.history.forEach(function (h, hi) {
      h.path.forEach(function (p, pi) {
        var item = {
          practice: hi + 1,
          decision: pi + 1,
          scenarioKey: h.scenarioKey || (h.target + "_1"),
          scenario: h.scenario || D.scenarios[h.scenarioKey || (h.target + "_1")],
          target: h.target,
          opponentType: h.opponentType,
          stage: p.stage,
          node: p.node,
          mode: p.mode,
          fit: p.fit,
          text: p.text,
          stateBefore: p.stateBefore,
          stateAfter: p.stateAfter,
          feedback: p.feedback || {},
        };
        allPath.push(item);
        fitCounts[p.fit] += 1;
        modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
        taskSum += axes[p.mode].task;
        relationSum += axes[p.mode].relation;
      });
    });

    var dom = dominantModes(allPath);
    var highKey = state.highest[0];
    var lowKey = state.lowest[0];
    var patternText = dom.map(function (m) { return D.types[m].label; }).join(", ");
    var modeBreakdown = D.order.filter(function (key) {
      return modeCounts[key];
    }).sort(function (a, b) {
      return modeCounts[b] - modeCounts[a];
    }).map(function (key) {
      return D.types[key].label + " " + modeCounts[key] + "회";
    }).join(", ");

    var highCount = modeCounts[highKey] || 0;
    var diagnosticLink;
    var unusedLowKey = D.order.filter(function (key) { return !modeCounts[key]; })[0] || lowKey;
    if (state.highest.length > 1) {
      var practicedKey = dom[0];
      var practicedCount = modeCounts[practicedKey] || 0;
      diagnosticLink =
        "진단 백분위는 여러 유형이 동점이었으므로, 실습에서 " + practicedCount +
        "회 나타난 " + D.types[practicedKey].label + " 반응을 실제 행동상의 주요 경향으로 해석했습니다.";
    } else {
      diagnosticLink =
        "진단상 " + (bandKey(state.scores[highKey]) === "high" ? "높게 나온 " : "다섯 중 가장 높았던 ") +
        D.types[highKey].label + " 반응은 실제 " + allPath.length +
        "개 결정 중 " + highCount + "회 나타났으며, " +
        (highCount >= Math.ceil(allPath.length / 3)
          ? "진단상의 기본 반응이 실습 행동에도 이어졌습니다."
          : "다른 대응을 더 자주 사용해 상황에 따라 기본 반응을 조정했습니다.");
    }

    var uniqueModes = Object.keys(modeCounts).length;
    var modeUsePoint =
      "총 " + allPath.length + "개 결정에서 " + patternText + " 방식이 가장 많이 나타났습니다(" +
      modeBreakdown + ").";
    var flexibilityPoint = uniqueModes <= 2
      ? "사용한 대응 유형이 " + uniqueModes + "개로 집중되어 일관성은 높았지만, 상황 변화에 맞춘 전략 전환은 더 살펴볼 필요가 있습니다."
      : "상황을 분석해서 적절한 대응 방식을 선택하고자 했습니다. 대응 방식을 바꾼 시점이 상대의 반응이나 새로 드러난 조건(일정·예산·권한 등)에 근거했는지 확인해보세요.";

    var taskAverage = taskSum / allPath.length;
    var relationAverage = relationSum / allPath.length;
    var patternPoints = [modeUsePoint, flexibilityPoint, diagnosticLink];

    // 내가 쓴 주요 대응 설명 + 나만의 대응 패턴 흐름 (진단 성향 블록에서 사용)
    var mainDescription = josa(D.types[dom[0]].label, "은", "는") + " " + D.types[dom[0]].tendency + "이 있어요.";
    var patternFlow = uniqueModes <= 2
      ? "특정 방식에 집중하는 것이 이번에 드러난 나의 대응 패턴이에요. 상황이 달라질 때도 이 패턴이 늘 최선인지 한 번씩 점검해보면 좋아요."
      : "상황에 따라 여러 방식을 오가는 것이 이번에 드러난 나의 대응 패턴이에요. 대응 방식의 전환이 상황에 따른 선택이었는지 성찰해보는 것이 중요합니다.";

    // 타 유형 이해 — 다섯 가지 대응 레퍼토리 중 내가 꺼낸 것과 남은 것을 짚어 준다.
    var usedTypeLabels = D.order.filter(function (k) { return modeCounts[k]; }).map(function (k) { return D.types[k].label; });
    var unusedTypeCount = D.order.filter(function (k) { return !modeCounts[k]; }).length;
    var repertoirePoint =
      "갈등 대응에는 경쟁형·협력형·타협형·회피형·수용형 다섯 가지 방식이 있고, 상황마다 잘 맞는 방식이 달라요. 이번엔 그중 " +
      usedTypeLabels.join("·") + " 방식을 주로 꺼내셨어요. " +
      (unusedTypeCount ? "상황에 맞게 전략적으로 나머지 방식을 활용해보는 것을 의식적으로 시도해보세요." : "다섯 방식을 두루 시도해보셨네요.");

    var riskyEndingCount = state.history.filter(function (h) {
      return h.endingKey === "patched" || h.endingKey === "stuck";
    }).length;
    var partialEndingCount = state.history.filter(function (h) {
      return h.endingKey === "partial";
    }).length;
    var practicalOutcome = riskyEndingCount > 0
      ? "대화가 끝났더라도 실행 동의가 충분하지 않을 수 있어요. 다음엔 종료 전에 담당자·기한·확인 방법을 명시하고, 상대가 실제로 동의한 조건을 다시 확인해보세요."
      : partialEndingCount > 0
        ? "당장의 진행 조건은 만들었지만 남은 쟁점이 다시 갈등으로 이어질 수 있어요. 다음엔 미해결 항목·재논의 시점·최종 결정권자를 함께 기록해두면 좋아요."
        : "과업 조건과 상대의 참여 의지가 함께 확보되는 결말을 만들어냈어요. 이 감각을 살려, 합의 내용을 담당자·기한·확인 방법으로 구체화하면 실행력이 더 단단해져요.";

    // 확인된 강점 — 어떤 선택을 했는지(근거)가 아니라, 잘 통한 방식의 강점을 해석해 보여준다.
    var goodModes = {};
    allPath.forEach(function (p) { if (p.fit === "good") goodModes[p.mode] = (goodModes[p.mode] || 0) + 1; });
    var goodModeKeys = D.order.filter(function (k) { return goodModes[k]; })
      .sort(function (a, b) { return goodModes[b] - goodModes[a]; });
    var strengthEvidence = [];
    if (goodModeKeys.length) {
      strengthEvidence.push(D.types[goodModeKeys[0]].label + ": " + D.types[goodModeKeys[0]].strength + ". " + firstSentence(D.types[goodModeKeys[0]].strengthDetail));
      strengthEvidence.push("이번 실습에서 이 방식이 상황이 요구한 것과 잘 맞아, 대화를 실제로 진전시키는 힘이 됐어요.");
      if (goodModeKeys.length > 1) {
        strengthEvidence.push("여기에 " + D.types[goodModeKeys[1]].label + " 방식도 함께 통해, 상황에 따라 대응을 바꿀 줄 아는 유연함도 보였어요.");
      }
    } else {
      strengthEvidence.push("이번엔 상황 요구에 딱 맞은 선택이 많지 않았어요. 그래도 여러 대응을 직접 시도하며 자신의 대응 폭을 확인한 것 자체가 의미 있는 출발이에요.");
    }

    // 학습 주안점 — 세 실습을 통틀어 반복된 대응 패턴에서 다음에 넓혀볼 지점을 짚는다.
    var cautionEvidence = [];
    cautionEvidence.push(Math.abs(taskAverage - relationAverage) < 0.35
      ? "과업 추진과 관계 고려를 비교적 균형 있게 오갔어요. 다음엔 상황마다 어느 쪽에 무게를 둘지 의식적으로 정해보면 더 좋아요."
      : taskAverage > relationAverage
        ? "전반적으로 자기 입장과 과업 추진을 앞세우는 쪽으로 기울었어요. 결론을 내기 전에 상대의 관점을 한 번 더 확인하는 여유를 더해보세요."
        : "전반적으로 상대 관점과 관계를 우선하는 쪽으로 기울었어요. 관계를 지키면서도 자신의 입장과 실행 기준을 분명히 밝히는 연습을 더해보세요.");
    cautionEvidence.push(D.types[unusedLowKey].label + ": 이번 실습에서 거의 꺼내지 않은 카드예요. " + D.types[unusedLowKey].underusedOpportunity + " 다음엔 의식적으로 한 번 시도해보세요.");
    cautionEvidence.push("실무 적용: " + practicalOutcome);

    // 코칭 메시지 — 강점을 먼저 인정하고, 학습 주안점을 다음 목표로 제시하는 톤
    var coachStrength = goodModeKeys.length
      ? patternText + " 방식으로 상황을 풀어가는 힘이 분명히 보였어요"
      : "익숙한 방식을 넘어 여러 대응을 직접 시도한 용기가 좋았어요";
    var coachGrow = Math.abs(taskAverage - relationAverage) < 0.35
      ? "여기에 상황마다 무게중심을 어디에 둘지 먼저 정하는 감각을 더하면"
      : taskAverage > relationAverage
        ? "여기에 결론을 내기 전 상대의 관점을 한 번 더 확인하는 여유를 더하면"
        : "여기에 관계를 지키면서도 자신의 입장과 실행 기준을 분명히 내미는 힘을 더하면";
    var coaching = [
      coachStrength + ".",
      coachGrow + ", 대화를 '합의'까지 끌고 가는 힘이 한층 단단해질 거예요. 지금도 충분히 잘하고 있어요.",
      "오늘 교육에서 발견한 나의 대응 패턴을 기억하고, 익숙한 방식 밖의 선택지를 한 번씩 넓혀보는 걸 다음 목표로 삼아보세요!",
    ];

    return {
      pattern: patternText,
      patternPoints: patternPoints,
      mainDescription: mainDescription,
      patternFlow: patternFlow,
      repertoirePoint: repertoirePoint,
      strengthEvidence: strengthEvidence,
      cautionEvidence: cautionEvidence,
      coaching: coaching,
    };
  }

  /* =============================== 렌더 =============================== */
  function render() {
    if (state.phase === "summary") tkiSend();
    var html = "";
    switch (state.phase) {
      case "onboarding": html = renderOnboarding(); break;
      case "profile": html = renderProfile(); break;
      case "tie": html = renderTie(); break;
      case "brief": html = renderBrief(); break;
      case "practice": html = renderPractice(); break;
      case "feedback": html = renderFeedback(); break;
      case "round": html = renderRound(); break;
      case "summary": html = renderSummary(); break;
    }
    root.innerHTML = shell(html);
    afterRender();
  }

  function progressStep() {
    // 상단 진행 인디케이터 (0~5)
    var map = { onboarding: 0, profile: 1, tie: 2, brief: 2, practice: 3, feedback: 4, round: 4, summary: 5 };
    return map[state.phase] || 0;
  }

  function shell(inner) {
    var steps = C.steps;
    var active = progressStep();
    // 화면(phase)이 실제로 바뀔 때만 진입 애니메이션. 같은 화면 내 리렌더는 카드가 정지 상태 유지.
    var enter = lastRenderedPhase !== state.phase ? " enter" : "";
    var bar = steps.map(function (s, i) {
      var cls = i < active ? "done" : i === active ? "on" : "";
      var current = i === active ? ' aria-current="step"' : "";
      var stepLabel = i < active ? "완료 단계: " + s : i === active ? "현재 단계: " + s : "예정 단계: " + s;
      return '<li class="' + cls + '"' + current + ' aria-label="' + stepLabel + '">' +
        '<span class="dot" aria-hidden="true"></span><span class="lbl" aria-hidden="true">' +
        s + "</span></li>";
    }).join("");
    return (
      '<div class="app" data-phase="' + state.phase + '">' +
      '<header class="top">' +
      '<div class="brand"><span class="mark">TKI</span><span class="brandtxt">' + esc(C.brand) + "</span></div>" +
      '<ol class="steps" aria-label="교육 진행 단계">' + bar + "</ol>" +
      "</header>" +
      '<main class="stage' + enter + '">' + inner + "</main>" +
      "</div>"
    );
  }

  /* ---- 온보딩 (백분위 입력) ---- */
  function renderOnboarding() {
    var rows = D.order.map(function (k) {
      var t = D.types[k];
      var v = state.form[k];
      return (
        '<div class="score-row">' +
        '<div class="score-info">' +
        '<label class="score-label" for="score-' + k + '">' + t.label + '<span class="en">' + t.en + "</span></label>" +
        proseParas(esc(t.tendency), "score-desc") +
        "</div>" +
        '<div class="score-ctl">' +
        '<button type="button" class="step-btn" data-action="step-score" data-type="' + k +
        '" data-delta="-1" aria-label="' + t.label + ' 백분위 1 낮추기">−</button>' +
        '<input id="score-' + k + '" class="slider" type="range" min="0" max="100" step="1" value="' + v +
        '" data-type="' + k + '" style="--pct:' + v + '%" aria-describedby="score-band-' + k + '" />' +
        '<button type="button" class="step-btn" data-action="step-score" data-type="' + k +
        '" data-delta="1" aria-label="' + t.label + ' 백분위 1 높이기">+</button>' +
        "</div>" +
        '<div class="score-out">' +
        '<input class="score-val" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + v +
        '" data-num="' + k + '" aria-label="' + t.label + ' 백분위 직접 입력" />' +
        '<span class="score-band" id="score-band-' + k + '" data-band="' + k + '">' + bandLabel(v) + "</span>" +
        "</div>" +
        "</div>"
      );
    }).join("");
    var spread = formSpread();
    var bandC = formBandCounts();

    return (
      '<section class="card intro">' +
      '<div class="ob-grid">' +
      '<div class="ob-side">' +
      '<div class="ob-kicker">TKI 기반 갈등 대응 코칭</div>' +
      "<h1>" + C.onboarding.title + "</h1>" +
      '<p class="lead">이미 받으신 <b>TKI 검사 결과</b>에서 출발합니다.<br>정답을 맞히는 자리가 아니라, ' +
      "상황에 맞는 대응을 골라보며 자신의 경향을 관찰하는 자리입니다.</p>" +
      '<ol class="ob-how">' +
      "<li><b>결과 입력</b><span>TKI 유형별 백분위와 업무맥락을 안내에 따라 입력합니다.</span></li>" +
      "<li><b>시나리오 실습</b><span>실제 업무 갈등 장면에서 대응을 선택합니다.</span></li>" +
      "<li><b>코칭 피드백</b><span>선택 경로를 진단 결과와 대조해 해석합니다.</span></li>" +
      "</ol>" +
      '<p class="ob-privacy">입력한 값은 이 브라우저에 저장되지 않으며, 교육 개선을 위해 이름 없이 익명 결과만 수집됩니다.</p>' +
      "</div>" +
      '<div class="ob-panel">' +
      '<div class="ob-panel-head"><h2 class="ob-panel-title">검사 결과 입력</h2>' +
      '<p class="ob-panel-sub">각 유형의 <b>백분위(Percentile) 0~100</b>을 결과지에 나온 값 그대로 입력하세요.</p>' +
      '<p class="ob-panel-note">원점수는 유형마다 문항 가중이 달라 같은 점수라도 실제 발현 정도가 다릅니다' +
      '(예: 6점이 경쟁형은 80%대, 협력형은 50%대). 유형 간 비교가 가능하도록 <b>백분위</b>를 입력받습니다.</p>' +
      '<p class="ob-panel-note">결과지에 백분위 숫자가 없고 프로파일 그래프만 있다면, 그래프의 <b>25%·75% 눈금</b>을 기준으로 막대가 놓인 위치를 슬라이더로 맞춰 주세요. 정확한 수치보다 유형 간 상대적 높낮이가 중요합니다.</p>' +
      '<p class="ob-panel-note band-legend"><span>낮음 0–25</span><span>중간 25–75</span><span>높음 75–100</span></p></div>' +
      '<div class="scores">' + rows + "</div>" +
      '<div class="score-foot">' +
      '<div class="total-wrap"><div class="total" data-total>최고–최저 격차 <b>' + spread + "</b></div>" +
      '<div class="total-meter" aria-hidden="true"><span class="total-fill' + (spread === 0 ? " off" : "") +
      '" data-meter style="width:' + spread + '%"></span><span class="total-tick"></span></div></div>' +
      '<div class="hint" data-hint role="status" aria-live="polite">' +
      (spread === 0 ? "" : "높음 " + bandC.high + " · 중간 " + bandC.mid + " · 낮음 " + bandC.low) +
      "</div>" +
      "</div>" +
      '<button class="btn primary big" data-action="submit-scores">' + esc(C.onboarding.submit) + "</button>" +
      "</div></div></section>"
    );
  }

  function profileChoice(field, item, selected) {
    return '<button class="profile-choice' + (selected ? " selected" : "") +
      '" data-action="profile-choice" data-field="' + field + '" data-value="' + item.key +
      '" aria-pressed="' + (selected ? "true" : "false") + '">' +
      '<span class="profile-radio" aria-hidden="true"></span><span>' + item.label + "</span></button>";
  }

  function renderProfile() {
    var draft = state.profileDraft;
    var jobChoices = profileOptions.job.map(function (item) {
      return profileChoice("job", item, draft.job === item.key);
    }).join("");
    var projectChoices = "";
    if (draft.job === "research") {
      projectChoices =
        '<div class="profile-group"><div class="profile-label">과제 내 역할</div>' +
        '<p class="profile-help">보직 여부가 아니라 현재 참여 중인 연구과제에서의 주요 역할을 선택해 주세요.</p>' +
        '<div class="profile-options" role="group" aria-label="과제 내 역할">' +
        profileOptions.projectRole.map(function (item) {
          return profileChoice("projectRole", item, draft.projectRole === item.key);
        }).join("") + "</div></div>";
    }
    var opponentChoices = profileOptions.opponent.map(function (item) {
      return profileChoice("recentOpponent", item, draft.recentOpponent === item.key);
    }).join("");
    var complete = draft.job && draft.recentOpponent && (draft.job !== "research" || draft.projectRole);

    return (
      '<section class="card profile-card">' +
      '<div class="tag-row"><span class="tag">' + esc(C.profile.tag) + "</span></div>" +
      "<h2>" + esc(C.profile.title) + "</h2>" +
      '<p class="lead">선택한 정보는 시나리오의 역할·권한·갈등 상대를 조정하는 데만 사용됩니다.<br>한 번 확정하면 이번 실습에서는 변경되지 않습니다.</p>' +
      '<div class="profile-group"><div class="profile-label">직군</div>' +
      '<div class="profile-options" role="group" aria-label="직군">' + jobChoices + "</div></div>" +
      projectChoices +
      '<div class="profile-group"><div class="profile-label">최근 부담되었던 갈등 상대</div>' +
      '<div class="profile-options" role="group" aria-label="최근 부담되었던 갈등 상대">' +
      opponentChoices + "</div></div>" +
      '<button class="btn primary big" data-action="confirm-profile"' + (complete ? "" : " disabled") +
      ">" + esc(C.profile.confirm) + "</button>" +
      '<p class="micro center">프로파일은 개인 식별 없이, 교육 개선을 위한 익명 결과 수집에만 사용됩니다.</p>' +
      "</section>"
    );
  }

  /* ---- 동점(최저 유형) 선택 ---- */
  function renderTie() {
    var values = D.order.map(function (key) { return state.scores[key]; });
    var allTied = Math.max.apply(null, values) === Math.min.apply(null, values);
    var opts = state.lowest.map(function (k) {
      return '<button class="choice" data-action="pick-tie" data-type="' + k + '">' +
        '<span class="choice-body">' + D.types[k].label + " 연습부터 시작</span></button>";
    }).join("");
    return (
      '<section class="card">' +
      "<h2>어느 유형부터 연습해 볼까요?</h2>" +
      '<p class="lead">' +
      (allTied
        ? "다섯 유형 백분위가 모두 같습니다. 뚜렷한 우세 유형을 단정하지 않고, 이번 세션에서 먼저 관찰할 유형을 하나 골라 주세요."
        : bandKey(state.scores[state.lowest[0]]) === "low"
          ? "백분위가 가장 낮은 유형이 여럿입니다. 이번 세션에서 먼저 다뤄볼 유형을 하나 골라 주세요."
          : "다섯 중 가장 낮은 축에 여러 유형이 동점입니다. 규준집단과 비교하면 낮은 편은 아니지만, 이번 세션에서 먼저 살펴볼 유형을 하나 골라 주세요.") +
      "</p>" +
      '<div class="choices">' + opts + "</div>" +
      "</section>"
    );
  }

  /* ---- 진단 브리핑 (STEP 3) ---- */
  function radarSvg(s) {
    var cx = 180, cy = 152, R = 88, n = D.order.length;
    function pt(i, r) {
      var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }
    function poly(r) {
      return D.order.map(function (_, i) { return pt(i, r).map(function (v) { return v.toFixed(1); }).join(","); }).join(" ");
    }
    var rings = [R / 3, (2 * R) / 3, R].map(function (r) {
      return '<polygon points="' + poly(r) + '" fill="none" stroke="#dde2ea" stroke-width="1"/>';
    }).join("");
    var axes = D.order.map(function (_, i) {
      var p = pt(i, R);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#e6eaf1" stroke-width="1"/>';
    }).join("");
    var valuePts = D.order.map(function (k, i) { return pt(i, (s[k] / 100) * R); });
    var shape = '<polygon points="' + valuePts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") +
      '" fill="rgba(51,70,192,0.13)" stroke="#3346c0" stroke-width="1.6" stroke-linejoin="round"/>';
    var dots = valuePts.map(function (p, i) {
      var hi = state.highest.indexOf(D.order[i]) >= 0;
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (hi ? 4 : 3) +
        '" fill="' + (hi ? "#3346c0" : "#fff") + '" stroke="#3346c0" stroke-width="1.6"/>';
    }).join("");
    var labels = D.order.map(function (k, i) {
      var p = pt(i, R + 14);
      var anchor = Math.abs(p[0] - cx) < 8 ? "middle" : p[0] > cx ? "start" : "end";
      var dy = p[1] < cy - 8 ? -4 : p[1] > cy + 8 ? 12 : 5;
      return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + dy).toFixed(1) + '" text-anchor="' + anchor +
        '" class="radar-lbl">' + D.types[k].label + ' <tspan class="radar-num">' + s[k] + "</tspan></text>";
    }).join("");
    return '<svg viewBox="0 0 360 306" role="img" aria-label="다섯 유형 백분위 레이더 차트">' +
      rings + axes + shape + dots + labels + "</svg>";
  }

  function renderBrief() {
    var target = state.pendingTarget || state.lowest[0];
    var s = state.scores;
    var maxv = Math.max.apply(null, D.order.map(function (k) { return s[k]; }));
    var minv = Math.min.apply(null, D.order.map(function (k) { return s[k]; }));
    var allTied = maxv === minv;
    var high = D.types[allTied ? target : state.highest[0]];

    var bars = D.order.map(function (k) {
      var t = D.types[k];
      var v = s[k];
      var w = v;
      var isHigh = state.highest.indexOf(k) >= 0;
      var isLow = state.lowest.indexOf(k) >= 0;
      var tag = allTied
        ? ' <span class="pill tie">동점</span>'
        : isHigh
          ? ' <span class="pill high">' + (state.highest.length > 1 ? "공동 최고" : "최고") + "</span>"
          : isLow ? ' <span class="pill low">최저</span>' : "";
      return (
        '<div class="bar-row">' +
        '<div class="bar-name">' + t.label + tag + '<span class="bar-band">' + bandLabel(v) + "</span></div>" +
        '<div class="bar-track"><div class="bar-fill' + (isHigh && !allTied ? " hi" : "") + '" style="width:' + w + '%"></div></div>' +
        '<div class="bar-num">' + v + "</div>" +
        "</div>"
      );
    }).join("");

    var targetType = D.types[target];
    // 순위(다섯 중 몇 위)와 밴드(규준집단 대비 높낮이)는 별개다. 해석 문구는 둘 다 보고 분기한다.
    var heroPct = s[allTied ? target : state.highest[0]];
    var heroBand = bandKey(heroPct);
    var tPct = s[target];
    var tBand = bandKey(tPct);
    var tendencyLine = allTied
      ? "다섯 유형 백분위가 모두 같아 뚜렷한 우세 유형을 단정하기 어렵습니다. 아래 내용은 이번에 선택한 " +
        targetType.label + " 행동을 관찰하기 위한 참고 설명입니다."
      : state.highest.length > 1
        ? state.highest.map(function (key) { return D.types[key].label; }).join("·") +
          "이 공동 최고입니다. 세부 설명은 그중 " + high.label + "을 기준으로 제시합니다. " + high.tendencyDetail
        : high.label + " — " + high.tendencyDetail;
    var goalLine;
    if (allTied) {
      goalLine = "백분위상 우세 유형이 없으므로 이번에는 " + targetType.label +
        " 행동을 의식적으로 관찰합니다. 특히 " + targetType.watch;
    } else {
      var goalHead = heroBand === "high"
        ? high.label + "의 강점을 유지하되, 이번에는 다음 행동을 의식합니다: " + high.goal + "."
        : heroBand === "mid"
          ? high.label + "은 다섯 중 가장 높지만, 규준집단과 비교하면 보통 수준이에요. 이 방식을 쓸 때 다음을 의식해 보세요: " + high.goal + "."
          : high.label + "조차 규준집단과 비교하면 자주 쓰는 편이 아니에요. 이번에는 이 방식부터 좀 더 분명하게 꺼내 보되, 다음을 함께 의식해 보세요: " + high.goal + ".";
      var goalTail = tBand === "low"
        ? " 동시에 " + targetType.label + "의 행동도 선택지에 올려보는 연습입니다. 특히 " + targetType.watch
        : tBand === "mid"
          ? " 동시에 " + targetType.label + "을 언제 고를지의 기준을 세워보는 연습입니다. 특히 " + targetType.watch
          : " 동시에 이미 자주 쓰는 " + targetType.label + "이 이 상황에 정말 맞는지 점검하는 연습입니다. 특히 " + targetType.watch;
      goalLine = goalHead + goalTail;
    }

    var heroType = allTied
      ? "다섯 유형 동점"
      : state.highest.map(function (key) { return D.types[key].label; }).join(" · ");
    var heroSub = allTied
      ? "이번 관찰 대상: " + targetType.label
      : state.highest.length > 1 ? "공동 최고 · 설명 기준: " + high.label : high.en;
    var heroLine = allTied
      ? "뚜렷한 우세 유형을 단정하지 않고, 이번 세션에서는 " + targetType.label + " 행동을 중심으로 관찰합니다."
      : high.tendency;
    var heroPctLine = allTied
      ? "다섯 유형 모두 백분위 " + heroPct + " · " + bandLabel(heroPct) + " — 규준집단과 비교하면 " + percentileNote(heroPct) + "입니다."
      : heroBand === "high"
        ? "백분위 " + heroPct + " · 높음 — 규준집단과 비교하면 " + percentileNote(heroPct) + "입니다. 갈등이 생겼을 때 자주 꺼내는 방식이에요."
        : heroBand === "mid"
          ? "백분위 " + heroPct + " · 중간 — 규준집단과 비슷한 수준이에요. 다섯 중에서는 가장 높지만 뚜렷한 주력이라고 보기는 어렵습니다."
          : "백분위 " + heroPct + " · 낮음 — 규준집단과 비교하면 " + percentileNote(heroPct) + "입니다. 다섯 중에서는 가장 높아도 자주 쓰는 방식은 아니에요.";
    // 최고 유형이 규준집단 기준으로 높지 않다면 "주력"이라 부르지 않는다.
    var heroKicker = allTied
      ? "RESULT · TIE"
      : heroBand === "high"
        ? "주요 대응 경향 — 지금 갈등을 보는 렌즈"
        : heroBand === "mid"
          ? "먼저 손이 가는 대응 — 다섯 중 가장 높은 유형"
          : "그나마 먼저 손이 가는 대응 — 다섯 중 가장 높은 유형";
    var heroCaveat = allTied || heroBand === "high"
      ? ""
      : "아래 설명은 이 방식을 주력으로 단정하는 것이 아니라, 다섯 중 상대적으로 먼저 활용하는 방식이라는 뜻으로 읽어 주세요.";

    // ── 결과 심층 해석 (C): 백분위 격차 기반 한 줄 + 상위 두 유형 결합 해석 ──
    // 임계값은 백분위(0~100) 기준. 25 미만=고른, 25~50=중간 분화, 50 이상=분화.
    var spread = maxv - minv;
    var gapLine;
    if (allTied) {
      gapLine = "다섯 유형 백분위가 모두 " + maxv + "(" + bandLabel(maxv) +
        ")으로 완전히 같습니다. 뚜렷한 우세 유형이 없어, 아래 해석은 이번에 관찰할 <b>" +
        targetType.label + "</b> 행동을 기준으로 한 참고 설명입니다.";
    } else if (spread >= 50) {
      gapLine = "가장 높은 " + high.label + "(백분위 " + maxv + " · " + bandLabel(maxv) + ")과 가장 낮은 유형(백분위 " + minv +
        " · " + bandLabel(minv) + ")이 <b>" + spread +
        "</b>포인트 벌어져 있습니다. 다섯 방식 가운데 <b>자주 택하는 방식과 잘 택하지 않는 방식의 차이가 큰 편</b>이에요. 다만 이 점수는 선호의 경향일 뿐, 실제 행동은 상황에 따라 달라질 수 있어요. 이번 연습에서는 가장 익숙한 방식이 잘 맞지 않는 장면에서 어떤 대응을 고르는지 살펴보세요.";
    } else if (spread >= 25) {
      gapLine = "가장 높은 유형(백분위 " + maxv + ")과 가장 낮은 유형(백분위 " + minv + ")이 <b>" + spread +
        "</b>포인트 벌어져 있습니다. 자주 택하는 방식과 덜 택하는 방식의 <b>차이가 중간 정도</b>예요. 익숙한 방식을 기본으로 두되, 다른 방식이 더 잘 맞는 순간을 알아차리는 연습을 해볼 수 있습니다.";
    } else {
      gapLine = "가장 높은 유형과 가장 낮은 유형의 차이가 <b>" + spread +
        "</b>포인트뿐이라, 다섯 방식을 택하는 정도가 <b>비슷한 편</b>이에요. 점수가 고르다는 것이 곧 상황마다 알맞은 방식을 골라 쓴다는 뜻은 아니에요. 이번 연습에서는 장면마다 '지금 무엇이 가장 중요한가'를 먼저 정하고 방식을 고르는 데 초점을 둬 보세요.";
    }

    var comboLine = "";
    if (!allTied && D.comboInsights) {
      var sortedByScore = D.order.slice().sort(function (a, b) { return s[b] - s[a]; });
      var t1 = sortedByScore[0], t2 = sortedByScore[1];
      var comboKey = [t1, t2].sort(function (a, b) {
        return D.order.indexOf(a) - D.order.indexOf(b);
      }).join("+");
      var comboBody = D.comboInsights[comboKey];
      if (comboBody) {
        var comboNote = bandKey(s[t1]) === "low"
          ? " 다만 두 유형 모두 규준집단과 비교하면 낮은 편이에요. 위 설명은 자주 쓰는 조합이라기보다, 그중 상대적으로 손이 먼저 가는 두 방식의 결로 읽어 주세요."
          : bandKey(s[t2]) === "low"
            ? " 다만 " + D.types[t2].label + "은 규준집단과 비교하면 낮은 편이라, 실제로는 " + D.types[t1].label + "이 이끄는 형태에 가깝습니다."
            : "";
        comboLine = "특히 백분위가 가장 높은 두 유형인 <b>" + D.types[t1].label + "</b>(" + s[t1] + ")과 <b>" +
          D.types[t2].label + "</b>(" + s[t2] + ")을 함께 놓고 보면, 한 유형만으로는 드러나지 않는 대응의 결이 보입니다. " +
          comboBody + comboNote;
      }
    }

    // ── 이번에 넓힐 유형 (A): 연습 대상 target 유형 전용 설명 (동점 시 hero와 중복되므로 생략) ──
    var targetBlock = "";
    if (!allTied) {
      var tRank = state.lowest.length > 1
        ? "다섯 중 가장 낮은 축에 속해, 이번 세션에서 먼저 다루기로 한 유형입니다."
        : "다섯 중 가장 낮게 나타난 유형입니다.";
      var tKicker, tIntro, tLead;
      if (tBand === "low") {
        tKicker = "이번에 넓힐 유형 — 아직 덜 쓰는 대응";
        tIntro = esc(tRank) + " 백분위 " + tPct + "이면 규준집단과 비교해도 " + esc(percentileNote(tPct)) +
          "라, 실제로 잘 꺼내지 않는 대응이에요. 상황과 사람에 맞게 의지적으로 선택해 볼 수 있는 대응 방식입니다.";
        tLead = targetType.underusedOpportunity;
      } else if (tBand === "mid") {
        tKicker = "이번에 다듬을 유형 — 언제 꺼낼지의 기준";
        tIntro = esc(tRank) + " 다만 백분위 " + tPct +
          "이면 규준집단과 비슷한 수준이라, 아예 안 쓰는 대응은 아니에요. <b>언제 이 방식을 고를지</b> 기준을 잡는 연습에 가깝습니다.";
        tLead = "이 방식이 특히 잘 맞는 조건을 알아두면, 상황을 보고 의도적으로 꺼낼 수 있게 됩니다.";
      } else {
        tKicker = "이번에 점검할 유형 — 이미 자주 쓰는 대응";
        tIntro = esc(tRank) + " 그런데 백분위 " + tPct + "이면 규준집단과 비교해 " + esc(percentileNote(tPct)) +
          "입니다. 다섯 중 가장 낮을 뿐 이미 자주 쓰는 대응이라, <b>넓혀야 할 카드가 아니라 제대로 쓰고 있는지 볼 카드</b>예요.";
        tLead = "이 방식이 어떤 조건에서 효과적인지 확인하고, 그 조건이 아닐 때도 습관적으로 꺼내고 있지는 않은지 살펴보세요.";
      }
      targetBlock =
        '<div class="target-block">' +
        '<div class="tb-kicker">' + esc(tKicker) + "</div>" +
        '<div class="tb-title">' + esc(targetType.label) +
        '<span class="tb-en">' + esc(targetType.en) + "</span>" +
        '<span class="req-chip">우선 요구 · ' + esc(targetType.requires) + "</span></div>" +
        proseParas(tIntro + " " + esc(tLead), "tb-lead") +
        '<div class="tb-grid">' +
        '<div class="tb-item"><div class="tb-label">이 대응이 가진 힘</div>' + proseParas(esc(targetType.strength)) + "</div>" +
        '<div class="tb-item"><div class="tb-label">이럴 때 효과적</div>' + proseParas(esc(targetType.effectiveWhen)) + "</div>" +
        "</div></div>";
    }

    // ── 밴드 점검: 규준집단 기준으로 특히 치우친 유형만 따로 짚는다 ──
    var overuseTypes = D.order.filter(function (k) { return s[k] >= OVERUSE_MIN; });
    var underuseTypes = D.order.filter(function (k) { return s[k] <= UNDERUSE_MAX; });
    var bandCheckBlock = "";
    if (overuseTypes.length || underuseTypes.length) {
      var bcItems = overuseTypes.map(function (k) {
        var t = D.types[k];
        return '<div class="bc-item over">' +
          '<div class="bc-h"><b>' + esc(t.label) + "</b>" +
          '<span class="bc-pct">백분위 ' + s[k] + "</span>" +
          '<span class="bc-tag over">과용 점검</span></div>' +
          proseParas(esc("규준집단과 비교하면 " + percentileNote(s[k]) + "입니다. 규준집단 대부분보다 이 방식을 자주 택한다는 뜻이에요. 이 방식을 과하게 쓰면 이런 일이 생길 수 있어요: " + t.overuseRisk), "bc-p") +
          proseParas("<b>압박을 받을 때 나타나는 신호</b> — " + esc(t.pressurePattern), "bc-p") +
          "</div>";
      }).join("") + underuseTypes.map(function (k) {
        var t = D.types[k];
        return '<div class="bc-item under">' +
          '<div class="bc-h"><b>' + esc(t.label) + "</b>" +
          '<span class="bc-pct">백분위 ' + s[k] + "</span>" +
          '<span class="bc-tag under">과소사용 점검</span></div>' +
          proseParas(esc("규준집단과 비교하면 " + percentileNote(s[k]) + "입니다. 규준집단 대부분보다 이 방식을 드물게 택한다는 뜻이에요. 이 방식이 필요한 상황에서 덜 쓰고 있지는 않은지 점검해볼 만해요. " + t.underusedOpportunity), "bc-p") +
          proseParas("<b>이럴 때 효과적</b> — " + esc(t.effectiveWhen), "bc-p") +
          "</div>";
      }).join("");
      bandCheckBlock =
        '<div class="bandcheck"><div class="vb-label">밴드 점검 — 특히 치우친 유형</div>' +
        '<p class="bc-note">백분위 ' + OVERUSE_MIN + ' 이상은 규준집단에서 위쪽 10% 안, ' + UNDERUSE_MAX +
        ' 이하는 아래쪽 10% 안이라는 뜻입니다. TKI 공식 해석은 상위 25%를 &lsquo;과하게 쓰고 있지 않은지&rsquo;, 하위 25%를 &lsquo;덜 쓰고 있지 않은지&rsquo; 점검해볼 범위로 보는데, 여기서는 그중에서도 특히 치우친 유형만 따로 짚었어요. 좋고 나쁨의 판정이 아니며, 어떤 방식이 알맞은지는 상황에 따라 달라요.</p>' +
        bcItems + "</div>";
    }

    var opponentLabel = optionLabel("opponent", state.profile.recentOpponent);

    return (
      '<section class="card brief">' +
      '<div class="tag-row"><span class="tag">' + esc(C.brief.tag) + "</span></div>" +
      "<h2>" + esc(C.brief.title) + "</h2>" +
      '<div class="profile-summary"><span>확정 프로파일</span><b>' + esc(profileRoleLabel(state.profile)) +
      "</b><span>최근 부담 상대</span><b>" + esc(opponentLabel) + "</b></div>" +

      '<div class="hero-result">' +
      '<div class="hero-kicker">' + esc(heroKicker) + "</div>" +
      '<div class="hero-type">' + esc(heroType) + '<span class="hero-en">' + esc(heroSub) + "</span>" +
      '<span class="req-chip">우선 요구 · ' + esc(high.requires) + "</span></div>" +
      '<p class="hero-pct">' + esc(heroPctLine) + "</p>" +
      proseParas(esc(heroLine), "hero-line") +
      (heroCaveat ? '<p class="hero-caveat">' + esc(heroCaveat) + "</p>" : "") +
      "</div>" +

      '<div class="viz-grid">' +
      '<div class="viz-box"><div class="vb-label">유형 밸런스</div><div class="radar-wrap">' + radarSvg(s) + "</div></div>" +
      '<div class="viz-box"><div class="vb-label">백분위 (0–100)</div><div class="bars">' + bars + "</div>" +
      '<p class="bars-legend">낮음 0–25 · 중간 25–75 · 높음 75–100 — 규준집단과 견준 위치</p></div>' +
      "</div>" +

      '<div class="insight-block"><div class="vb-label">결과 심층 해석</div>' +
      proseParas("갈등 대응에는 경쟁형·협력형·타협형·회피형·수용형 다섯 가지 방식이 있어요. 어느 하나가 늘 정답은 아닙니다. 상황마다 잘 맞는 방식이 다르니까요. 이번 진단은 지금 손에 익은 방식이 무엇인지 보여줄 뿐이에요.", "insight-gap") +
      proseParas("아래 숫자는 <b>백분위</b>입니다. 같은 검사를 받은 사람들, 곧 <b>규준집단</b> 100명과 견줬을 때 내가 몇 번째쯤인지를 나타내요. 경쟁형이 82라면 규준집단 100명 중 82명보다 그 방식을 자주 쓴다는 뜻입니다.", "insight-gap") +
      proseParas(gapLine, "insight-gap") +
      (comboLine ? proseParas(comboLine, "insight-gap") : "") +
      "</div>" +

      bandCheckBlock +

      '<div class="axes-block"><div class="vb-label">내 성향이 작용하는 두 축</div>' +
      '<div class="dc-axes">' +
      '<div class="dc-axis"><div class="dc-axis-h">과업 영향</div>' + proseParas(esc(high.taskImpact)) + "</div>" +
      '<div class="dc-axis"><div class="dc-axis-h">관계 영향</div>' + proseParas(esc(high.relationshipImpact)) + "</div>" +
      "</div></div>" +

      '<details class="more brief-more"><summary>이 경향 자세히 보기 — 강점·과용 신호·효과적 조건·심층 해설</summary>' +
      '<div class="brief-grid">' +
      '<div class="brief-item"><div class="bi-label">강점 상세</div>' +
      pointList(splitSentences(high.strengthDetail), "readable-points brief-points") + "</div>" +
      '<div class="brief-item"><div class="bi-label">이 방식이 과할 때</div>' +
      pointList(splitSentences(high.cautionDetail + " " + high.overuseRisk), "readable-points brief-points") + "</div>" +
      '<div class="brief-item"><div class="bi-label">효과적으로 작동하는 조건</div>' +
      pointList(splitSentences(high.effectiveWhenDetail), "readable-points brief-points") + "</div>" +
      '<div class="brief-item"><div class="bi-label">경향과 상대가 받는 인상</div>' +
      pointList(splitSentences(tendencyLine + " " + high.impact), "readable-points brief-points") + "</div>" +
      "</div></details>" +

      targetBlock +

      '<div class="goal"><span class="goal-tag">CHECK</span><div><b>실습 전 체크포인트</b>' +
      pointList(
        [goalLine, profileGuidance(state.profile), "표현 팁: " + high.tip],
        "readable-points goal-points"
      ) + "</div></div>" +

      '<div class="next-up"><span class="nu-tag">NEXT</span><div>' +
      "<b>이 경향, 실제 상황에서는 어떻게 나타날까요?</b>" +
      proseParas("프로파일에서 선택한 최근 부담 상대 — <b>" + esc(opponentLabel) +
        "</b> — 와의 갈등 장면에서 직접 대응을 골라봅니다." +
        esc(D.profiles.relationshipSuffixes[state.profile.recentOpponent] || "")) + "</div></div>" +
      '<p class="micro">※ 규준집단과 견준 <b>백분위</b>를 바탕으로 대응 경향을 읽은 것입니다. 개인의 성격을 단정하는 평가가 아닙니다.</p>' +
      '<button class="btn primary big" data-action="start-first">' +
      esc(opponentLabel) + "와 첫 실습 시작 →</button>" +
      "</section>"
    );
  }
  function briefItem(label, body) {
    return '<div class="brief-item"><div class="bi-label">' + label + "</div>" +
      pointList(splitSentences(body), "readable-points brief-points") + "</div>";
  }

  /* ---- 실습 (STEP 4) ---- */
  function renderPractice() {
    var cur = state.current;
    var stateName = D.states[cur.stateIdx];
    var revealDelay = 170;
    function revealAttr(message, step) {
      if (!message.animate) return "";
      var delay = revealDelay;
      revealDelay += step;
      return ' data-reveal style="--reveal-delay:' + delay + 'ms"';
    }
    function typingHtml(message, label) {
      if (!message.animate) return "";
      var delay = revealDelay;
      revealDelay += 1080;
      return '<div class="typing-indicator" data-typing style="--typing-delay:' + delay +
        'ms" aria-label="' + esc(label) + ' 입력 중"><span></span><span></span><span></span></div>';
    }
    var beatLabels = { 1: "쟁점 정의", 2: "대응 조정", 3: "실행 합의" };
    var beats = [1, 2, 3].map(function (n) {
      var cls = cur.ended || cur.stage > n ? "done" : cur.stage === n ? "on" : "";
      return '<li class="' + cls + '"><span class="beat-n">0' + n + '</span><span class="beat-lbl">' +
        beatLabels[n] + "</span></li>";
    }).join("");
    var header =
      '<div class="practice-head">' +
      '<div class="ph-left"><span class="sess">실습 ' + Math.min(state.completed + 1, 3) + '/3</span>' +
      '<span class="ph-meta">타깃: ' + D.types[cur.target].label + " · 상대: " +
      optionLabel("opponent", cur.opponentType) + "</span></div>" +
      '<div class="mood mood-' + cur.stateIdx + '" role="status" aria-live="polite">' +
      '<span class="mood-dot" aria-hidden="true"></span>상대 심리: ' + stateName + "</div>" +
      "</div>" +
      '<ol class="beats" aria-label="시나리오 진행 단계">' + beats + "</ol>";

    var opp = cur.scenario.opponent;
    var msgs = cur.messages.map(function (m) {
      if (m.role === "sys") {
        var sceneLines = splitSentences(m.text).map(function (line) {
          return '<p class="scene-line"' + revealAttr(m, 520) + ">" + esc(line) + "</p>";
        }).join("");
        var authorityCue = cur.scenario.authorityCue
          ? '<div class="authority-cue"' + revealAttr(m, 520) + ">" +
            esc(cur.scenario.authorityCue) + "</div>"
          : "";
        return '<div class="scene-card"><div class="scene-head">' +
          '<span class="scene-badge">SCENE</span>' +
          '<span class="scene-who">' + esc(opp.name) + (opp.role ? " · " + esc(opp.role) : "") + "</span>" +
          '<span class="scene-ctx">' + esc(cur.scenario.profileContext) + "</span></div>" +
          '<div class="scene-body">' + sceneLines + authorityCue + "</div></div>";
      }
      if (m.role === "opp") {
        var reactionHtml = m.reaction
          ? '<div class="reaction"' + revealAttr(m, 470) + ">" + esc(m.reaction) +
            (m.state ? ' <span class="statechip">→ ' + m.state + "</span>" : "") + "</div>"
          : "";
        var lineHtml = "";
        if (m.text) {
          var typing = typingHtml(m, opp.name);
          var oppBubbles = splitSentences(m.text).map(function (line) {
            return '<div class="bubble opp"' + revealAttr(m, 730) + ">" +
              esc(stripOuterQuotes(line)) + "</div>";
          }).join("");
          lineHtml = '<div class="message-group opp-group">' +
            '<div class="msg-head"><span class="avatar opp-avatar" aria-hidden="true">' +
            esc(opp.name.charAt(0)) + '</span><span class="speaker-label">' + esc(opp.name) +
            (opp.role ? " · " + esc(opp.role) : "") + "</span></div>" + typing + oppBubbles + "</div>";
        }
        return '<div class="turn">' + reactionHtml + lineHtml + "</div>";
      }
      if (m.role === "me") {
        var myBubbles = splitSentences(m.text).map(function (line) {
          return '<div class="bubble me"' + revealAttr(m, 440) + ">" +
            esc(stripOuterQuotes(line)) + "</div>";
        }).join("");
        return '<div class="message-group me-group">' +
          '<div class="msg-head me-head"><span class="speaker-label me-label">나</span>' +
          '<span class="avatar me-avatar" aria-hidden="true">나</span></div>' + myBubbles + "</div>";
      }
      if (m.role === "end") {
        var e = D.endings[m.endingKey];
        return '<div class="ending ending-' + e.tone + '" role="status"' + revealAttr(m, 820) +
          '><span class="ending-label">' + e.label + "</span>" + proseParas(esc(m.text)) + "</div>";
      }
      return "";
    }).join("");

    var interaction = "";
    if (cur.locked) {
      interaction = '<div class="conversation-status" role="status" aria-live="polite"><span>' +
        (cur.ended ? "대화 결과를 정리하고 있습니다…" : C.practice.waiting) +
        '</span><button type="button" class="skip-dialogue" data-action="skip-dialogue">' +
        (cur.ended ? "결과 바로 보기" : C.practice.skip) + "</button></div>";
    } else if (!cur.ended) {
      var choices = currentChoices(cur);
      var choiceEls = choices.map(function (c, i) {
        return '<button class="choice" data-action="choose" data-index="' + i +
          '" aria-label="선택 ' + String.fromCharCode(65 + i) + ': ' + esc(c.text) + '">' +
          '<span class="choice-key">' + String.fromCharCode(65 + i) + "</span>" +
          '<span class="choice-body">' + esc(c.text) + "</span></button>";
      }).join("");
      interaction =
        '<div id="decision-prompt" class="prompt-q"><span class="prompt-chip">결정 ' + cur.stage +
        "</span>" + esc(C.practice.prompt) + "</div>" +
        '<div class="choices" role="group" aria-labelledby="decision-prompt">' + choiceEls + "</div>" +
        '<div class="decision-count" aria-live="polite">결정 ' + cur.stage + " / 3 · " +
        esc(beatLabels[cur.stage]) + "</div>";
    }
    cur.revealDuration = revealDelay;

    return (
      '<section class="card practice" tabindex="-1" aria-label="갈등 대응 선택지 실습">' +
      '<div class="tag-row"><span class="tag">' + esc(C.practice.tag) + "</span></div>" +
      header +
      '<div class="convo" role="log" aria-label="갈등 대화" aria-live="polite" aria-relevant="additions text" tabindex="0">' +
      msgs + "</div>" +
      interaction +
      "</section>"
    );
  }

  /* ---- 미니 피드백 (STEP 5) ---- */
  function renderFeedback() {
    var fb = buildMiniFeedback();
    state._fb = fb;

    var domNames = fb.dominant.map(function (m) { return D.types[m].label; }).join(", ");
    // 대응 경향이 이 상황의 적합·학습 유형과 단독으로 일치하는지 — 여러 블록에서 톤을 이어주는 데 쓴다.
    var fitMode = state.current.scenario.target;
    var fitType = D.types[fitMode];
    var usedFitType = fb.dominant.length === 1 && fb.dominant[0] === fitMode;
    // 나타난 대응 경향 — 한 줄 요약 + 자세한 설명(진단 대조 포함)
    var reqTerm = state.current.scenario.requires;
    var usedModes = {};
    fb.path.forEach(function (p) { usedModes[p.mode] = true; });
    var usedCount = Object.keys(usedModes).length;
    var tendencyLead = usedCount >= 3
      ? "이번 실습에서는 세 번의 결정에서 <b>각기 다른 방식</b>을 꺼내 보셨어요."
      : "이번 실습에서 가장 자주 꺼낸 대응은 <b>" + esc(domNames) + "</b> 방식이었어요.";
    var flexProse = usedCount === 1
      ? (usedFitType
          ? "세 번의 결정에서 줄곧 같은 방식을 유지했습니다. 이 상황에는 그 일관성이 잘 맞아떨어졌어요 — 흔들림 없이 필요한 대응을 이어가신 셈이에요."
          : "세 번의 결정에서 줄곧 같은 방식을 유지했습니다. 상황이 바뀌어도 흔들리지 않은 일관성은 분명한 강점이지만, 다른 대응으로 바꿔야 할 신호를 놓치지는 않았는지 한 번쯤 돌아보면 좋아요.")
      : usedCount === 2
        ? "상대의 반응에 따라 두 가지 방식을 오가며 조정했어요. 대응을 바꾼 그 순간이 실제 상황 단서와 잘 맞았는지 살펴보면 전략이 한층 정교해집니다."
        : "세 번 모두 다른 방식을 시도했네요. 대응의 폭이 넓다는 건 좋은 신호예요. 다만 그 전환이 그때그때의 상황 근거에 따른 선택이었는지 확인해보면 더 단단해집니다.";
    var dom0 = fb.dominant[0];
    var allTiedScores = state.highest.length === D.order.length && state.lowest.length === D.order.length;
    var dom0Label = esc(D.types[dom0].label);
    // 순위(다섯 중 몇 위)와 밴드(규준집단 대비 높낮이)는 다르다. 둘 다 확인해야 문구가 사실과 맞는다.
    var dom0Band = state.scores ? bandKey(state.scores[dom0]) : "mid";
    var contrastProse = allTiedScores
      ? "진단 백분위가 모두 같아 뚜렷한 우세 유형은 없었는데, 이번엔 " + esc(domNames) + " 방식을 주로 꺼내 보셨네요."
      : state.highest.indexOf(dom0) >= 0
        ? (dom0Band === "high"
            ? "진단에서도 높게 나온 " + dom0Label + " 방식이 실습에서도 그대로 나왔어요. 평소 가장 손에 익은 대응이 자연스럽게 나온 셈이에요."
            : "다섯 중 가장 높았던 " + dom0Label + " 방식이 실습에서도 나왔어요. 다만 규준집단과 비교하면 두드러진 정도는 아니라, 이번 실습이 그 방식을 더 선명하게 만드는 계기가 될 수 있어요.")
        : state.lowest.indexOf(dom0) >= 0
          ? (dom0Band === "low"
              ? "흥미로운 점은, 진단에서 실제로 낮게 나온 " + dom0Label + " 방식을 이번엔 여러 번 시도했다는 거예요. 평소 잘 꺼내지 않던 카드를 의식적으로 써 본 거죠."
              : "다섯 중에서는 낮은 축이던 " + dom0Label + " 방식을 이번엔 주로 썼어요. 규준집단과 비교하면 평균 이상이라 낯선 카드는 아니지만, 스스로 덜 쓴다고 여기던 방식이 실제로는 나온 셈이에요.")
          : (dom0Band === "high"
              ? "다섯 중 순위로는 중간이지만 규준집단과 비교하면 높게 나온 " + dom0Label + " 방식을 이번엔 주로 썼어요. 순위에 가려 잘 안 보이던, 손에 익은 카드였던 셈이에요."
              : dom0Band === "low"
                ? "다섯 중 순위로는 중간이지만 규준집단과 비교하면 낮은 편인 " + dom0Label + " 방식을 이번엔 주로 썼어요. 평소 자주 쓰지 않던 카드를 꺼낸 셈이에요."
                : "진단상 중간이던 " + dom0Label + " 방식을 이번엔 주로 활용하며 상황에 맞춰 움직였어요.");
    var tendencyBlock =
      '<div class="fb-block reflect tendency-box"><div class="fb-h">나타난 대응 경향</div>' +
      '<p class="fb-lead">' + tendencyLead + "</p>" +
      proseParas(flexProse + " " + contrastProse) +
      "</div>";

    // ── 실습 결과 종합 해석 ──
    var fc = fb.fitCounts;
    var firstState = state.current.path[0].stateBefore;
    var lastState = state.current.path[state.current.path.length - 1].stateAfter;
    var stateDelta = stateIndex(lastState) - stateIndex(firstState);
    var taskSynth = fc.good >= 2
      ? "세 번의 선택이 대체로 상황의 핵심 조건을 잘 짚어, 일을 실제로 굴러가게 하는 힘이 있었어요."
      : fc.poor >= 2
        ? "쉽지 않은 국면에서도 대화를 계속 이어가려 한 점이 좋았어요. 핵심 조건을 조금 더 분명히 하면 한층 단단해질 거예요."
        : "상황의 방향을 여는 선택을 해낸 점이 좋았어요. 핵심 조건까지 마저 매듭지으면 완성도가 더 높아질 거예요.";
    var relSynth = stateDelta > 0
      ? "상대의 경계도 " + firstState + "에서 " + josaRo(lastState) + " 풀리며, 신뢰를 쌓는 쪽으로 이어졌어요."
      : stateDelta < 0
        ? "관계 면에서는 대화가 이어질수록 상대가 " + josaRo(lastState) + " 움츠러들어, 약간의 부담이 남았을 수 있어요."
        : "관계 면에서는 상대의 태도에 큰 변화가 없었어요. 해치지도, 눈에 띄게 가까워지지도 않은 흐름이었습니다.";
    var reqGloss = (D.requiresGloss && D.requiresGloss[reqTerm]) || "";
    // 이 블록에서만 풀어쓴 라벨을 쓴다. 짧은 라벨(칩·'잘 맞는 대응')이 풀어쓴 라벨에 그대로 들어가므로
    // 학습자가 두 표기를 같은 것으로 읽는다. 예: 공동 해법 ↔ 공동 해법 찾기
    var reqLong = (D.requiresLabel && D.requiresLabel[reqTerm]) || reqTerm;
    var requiresBox =
      '<div class="synth-req">' +
      '<div class="sr-title">이번 실습 돌아보기</div>' +
      "<p>이번 상황의 목표는 <b>‘" + esc(reqLong) + "’</b> — " + esc(reqGloss) + "이에요. 이 목표를 이해하고 내 대응을 견주어 보는 것이 이번 실습의 핵심이에요.</p>" +
      proseParas(esc(taskSynth) + " " + esc(relSynth)) +
      "</div>";

    // ── 이 상황에 특히 잘 맞는 대응(모범) — 이번 회차 학습 목표 유형과 동일 ──
    // 대응 경향(내가 쓴 방식)과 적합 유형을 이어, 내 패턴과 다른 유형을 함께 이해하도록 안내한다.
    var fitAlt = fb.worst.alt || {};
    var fitQuote = fitAlt.text ? stripOuterQuotes(fitAlt.text) : "";
    var fitLabel = esc(fitType.label);
    var fitTail = esc(josa(fitType.label, "은", "는")) + " " + esc(fitType.tendency) + "이 있거든요.";
    var altHow;
    if (usedFitType) {
      altHow = "이 상황에서는 <b>" + fitLabel + "</b> 방식이 특히 잘 맞아요. 이번 실습에서 바로 이 방식을 주로 꺼내셨으니, 상황에 잘 맞는 대응을 스스로 선택하신 셈이에요. " + fitTail;
    } else if (fb.dominant.length === 1) {
      altHow = "이번엔 주로 <b>" + esc(D.types[fb.dominant[0]].label) + "</b> 방식을 꺼내셨는데, 이 장면은 <b>" + fitLabel + "</b> 방식에 조금 더 가까웠어요. " + fitTail;
    } else {
      altHow = "이번엔 여러 방식을 오가셨는데, 이 장면에 특히 잘 맞는 건 <b>" + fitLabel + "</b> 방식이에요. " + fitTail;
    }
    var altExample = fitQuote
      ? '<div class="fb-alt"><span class="fb-alt-label">' +
        esc(josa(fitType.label, "이라면", "라면")) + " (결정 " + fb.worst.n + ")</span>" +
        '<p class="fb-alt-quote">' + esc(fitQuote) + "</p></div>"
      : "";
    var altWhy = "이렇게 하면 이 상황의 목표인 <b>‘" + esc(reqTerm) + "’</b>" +
      josa(reqTerm, "과", "와").slice(reqTerm.length) + " 자연스럽게 이어져요. " + esc(fitType.label) + " 방식은 " +
      esc(fitType.effectiveWhen) + "에서 특히 효과적입니다.";
    var altBlock =
      '<div class="fb-block grow"><div class="fb-h">이 상황에 특히 잘 맞는 대응</div>' +
      proseParas(altHow) +
      altExample +
      proseParas(altWhy) +
      "</div>";

    var synthBlock =
      '<div class="fb-block"><div class="fb-h">실습 결과 종합 해석</div>' +
      requiresBox +
      altBlock +
      "</div>";

    // ── 이번 교육 주요 학습 포인트! (동기부여) ──
    var learnType = D.types[state.current.target];
    var learnLabel = "<b>" + esc(learnType.label) + "</b>";
    // 타깃은 "다섯 중 최저"일 뿐이므로, 규준집단 기준으로도 낮은지(밴드)를 확인하고 문구를 고른다.
    var learnBand = bandKey(state.scores[state.current.target]);
    // usedFitType(대응 경향 = 적합·학습 유형)일 때는 이미 잘 활용했음을 인정하고 이어가도록 안내한다.
    var learnLead = usedFitType
      ? (learnBand === "low"
          ? learnLabel + " 대응은 진단에서 실제로 덜 나왔던 방식인데, 이번 실습에서 스스로 잘 꺼내 활용하셨어요. 이 감각을 기억해, 앞으로도 <b>의식적으로 이어가</b> 보세요."
          : learnLabel + " 대응은 다섯 중에서는 낮은 축이었는데, 이번 실습에서 상황에 맞게 잘 꺼내 활용하셨어요. 이 방식이 언제 맞는지 감이 잡힌 셈이니, 그 <b>기준을 기억해</b> 두세요.")
      : learnBand === "low"
        ? learnLabel + " 대응은 진단에서 아직 덜 꺼내 쓰던 카드예요. 이번 교육에서는 이걸 <b>의식적으로 한 번 더 시도</b>해보는 걸 목표로 삼아보세요."
        : learnBand === "mid"
          ? learnLabel + " 대응은 규준집단과 비교하면 보통 수준인데, 다섯 중에서는 낮은 축이에요. <b>언제 꺼낼지의 기준</b>이 아직 흐린 카드죠. 이번 교육에서는 이 방식을 고를 조건을 의식해보는 걸 목표로 삼아보세요."
          : learnLabel + " 대응은 규준집단과 비교하면 이미 자주 쓰는 카드예요. 이번 교육에서는 새로 넓히기보다, 이 방식이 <b>이 상황에 정말 맞는지 점검</b>해보는 걸 목표로 삼아보세요.";
    var learnParas = [
      learnLead,
      "핵심은 " + esc(josa(learnType.goal, "이에요", "예요")) + ".",
      "처음부터 자연스럽지 않아도 괜찮습니다 — 익숙한 방식 밖의 선택지를 하나씩 늘려가는 과정 자체가 성장이니까요.",
    ];
    var learnBlock =
      '<div class="learn-point"><div class="lp-title">이번 교육 주요 학습 포인트!</div>' +
      learnParas.map(function (para) { return proseParas(para); }).join("") +
      "</div>";

    // STEP 5 회차 분기 옵션
    var roundBlock = renderRoundOptions();

    return (
      '<section class="card feedback">' +
      '<div class="tag-row"><span class="tag">' + esc(C.feedback.tag) + "</span></div>" +
      "<h2>" + esc(C.feedback.title) + "</h2>" +

      tendencyBlock +

      synthBlock +

      learnBlock +

      '<hr class="sep" />' +
      roundBlock +
      "</section>"
    );
  }

  /* ---- STEP 5 회차 옵션 (피드백 하단에 임베드) ---- */
  function renderRoundOptions() {
    var opts = "";

    if (state.completed >= 3) {
      return (
        '<div class="round-wrap"><div class="round-title">세 번의 실습을 마쳤습니다.</div>' +
        '<button class="btn primary big" data-action="go-summary">종합 피드백 리포트 보기 →</button></div>'
      );
    }

    var nextType = lowestUnusedType();
    var remainingOpponents = profileOptions.opponent.filter(function (item) {
      return state.usedOpponents.indexOf(item.key) < 0;
    });
    opts += remainingOpponents.map(function (item) {
      var description = item.key === "junior" ? "업무 안내와 피드백이 필요한 상대" :
        item.key === "colleague" ? "비슷한 책임 범위에서 조율하는 상대" :
          item.key === "otherDept" ? "절차와 우선순위가 다른 부서의 상대" :
            "승인·예산·인력 권한을 가진 상대";
      return '<button class="round-card" data-action="round" data-kind="opponent" data-opponent="' + item.key + '">' +
        '<span class="rc-title">' + item.label + "</span><span class=\"rc-sub\">" + description + "</span></button>";
    }).join("");

    if (state.completed >= 2) {
      opts += roundCard("summary", "종합 피드백 보기", "지금까지의 실습을 종합해 리포트를 봅니다");
    }

    return (
      '<div class="round-wrap"><div class="round-title">다음 실습에서 누구와 연습할까요?</div>' +
      '<div class="round-target-note"><span>다음 연습 유형</span><b>' +
      D.types[nextType].label +
      '</b><p>현재 백분위와 미실습 유형을 기준으로 자동 선정됩니다.</p></div>' +
      '<p class="round-note">앞서 실습한 상대는 선택지에서 제외했습니다.</p>' +
      '<div class="round-cards">' + opts + "</div>" +
      (state.completed < 2 ? '<p class="round-note">종합 피드백은 2회 이상 실습을 마친 뒤 확인할 수 있습니다.</p>' : "") +
      "</div>"
    );
  }
  function roundCard(kind, title, sub) {
    return '<button class="round-card" data-action="round" data-kind="' + kind + '">' +
      '<span class="rc-title">' + title + "</span><span class=\"rc-sub\">" + esc(sub) + "</span></button>";
  }

  // round phase는 피드백 내 임베드로 대체되므로 단순 리다이렉트용
  function renderRound() { return renderFeedback(); }

  /* ---- 종합 피드백 (STEP 6) ---- */
  function renderSummary() {
    var s = buildSummary();

    // 표시용 집계 (분포 시각화·대조 전용)
    var modeCounts = {};
    var totalDecisions = 0;
    state.history.forEach(function (h) {
      h.path.forEach(function (p) {
        modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
        totalDecisions += 1;
      });
    });
    var maxCount = 0;
    D.order.forEach(function (k) { if ((modeCounts[k] || 0) > maxCount) maxCount = modeCounts[k] || 0; });
    var distRows = D.order.map(function (k) {
      var c = modeCounts[k] || 0;
      var w = totalDecisions ? Math.round((c / totalDecisions) * 100) : 0;
      var top = c && c === maxCount ? " top" : "";  // 최다 사용 유형만 코발트 강조, 나머지는 중립
      return '<div class="dist-row' + (c ? "" : " empty") + '">' +
        '<span class="dist-name">' + D.types[k].label + "</span>" +
        '<span class="dist-track"><span class="dist-fill mode-fill-' + k + top + '" style="width:' + w + '%"></span></span>' +
        '<span class="dist-num">' + c + "회</span></div>";
    }).join("");
    var highLabels = state.highest.map(function (k) { return D.types[k].label; }).join(" · ");
    // 다섯 중 최고라도 규준집단 기준으로 높지 않을 수 있으므로 라벨을 구분한다.
    var highSideLabel = bandKey(state.scores[state.highest[0]]) === "high"
      ? "진단상 높은 유형" : "다섯 중 최고 유형";

    var strengthRows = s.strengthEvidence.map(function (t) {
      return '<li><span class="sn" aria-hidden="true"></span><span>' + emphasizeLead(t) + "</span></li>";
    }).join("");
    var cautionRows = s.cautionEvidence.map(function (t) {
      return '<li><span class="sn" aria-hidden="true"></span><span>' + emphasizeLead(t) + "</span></li>";
    }).join("");

    return (
      '<section class="card summary">' +
      '<div class="tag-row"><span class="tag">' + esc(C.summary.tag) + "</span></div>" +
      "<h2>" + esc(C.summary.title) + "</h2>" +

      '<div class="fb-hero">' +
      '<div class="hero-kicker">대응 패턴 요약</div>' +
      '<p class="fb-hero-line">' + emphasizeLead(s.patternPoints[0]) + "</p>" +
      '<div class="dist">' + distRows + "</div>" +
      '<p class="sum-flex">' + esc(s.patternPoints[1] || "") + "</p>" +
      "</div>" +

      '<div class="fb-block"><div class="fb-h">진단 성향과 나의 대응 패턴</div>' +
      '<div class="vs-head"><span class="vs-side"><span class="vs-side-l">' + esc(highSideLabel) + '</span><b>' +
      esc(highLabels) + '</b></span><span class="vs-divider">vs</span>' +
      '<span class="vs-side"><span class="vs-side-l">실전 최다 선택</span><b>' + esc(s.pattern) + "</b></span></div>" +
      proseParas(esc(s.patternPoints[2] || "")) + proseParas(esc(s.mainDescription)) + proseParas(esc(s.patternFlow)) + proseParas(esc(s.repertoirePoint)) + "</div>" +

      '<div class="fb-block good"><div class="fb-h">근거로 확인된 강점</div><ul class="strat">' + strengthRows + "</ul></div>" +
      '<div class="fb-block grow"><div class="fb-h">학습 주안점 — 다음에 시도해 볼 대응</div><ul class="strat">' + cautionRows + "</ul></div>" +
      '<div class="coach-msg"><span class="coach-tag">COACH</span>' +
      '<div class="coach-body">' +
      s.coaching.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      "</div></div>" +

      '<button class="btn primary big" data-action="restart">' + esc(C.summary.restart) + "</button>" +
      '<p class="micro center">이 리포트는 화면 표시용이며, 교육 개선을 위해 이름 없는 익명 결과가 수집됩니다. 필요하면 캡처해 활용하세요.</p>' +
      "</section>"
    );
  }

  /* ============================ 이벤트 ============================ */
  function schedulePracticeAdvance() {
    if (practiceTimer) clearTimeout(practiceTimer);
    var cur = state.current;
    var token = ++practiceAnimationToken;
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var wait = reduceMotion ? 80 : Math.max(450, cur.revealDuration + 250);
    practiceTimer = setTimeout(function () {
      if (token !== practiceAnimationToken || state.current !== cur || state.phase !== "practice") return;
      cur.messages.forEach(function (message) { message.animate = false; });
      cur.locked = false;
      if (cur.nextPhase) {
        state.phase = cur.nextPhase;
        cur.nextPhase = null;
      } else {
        cur.focusNextChoice = true;
      }
      render();
    }, wait);
  }

  function skipPracticeReveal() {
    var cur = state.current;
    if (state.phase !== "practice" || !cur || !cur.locked) return;
    if (practiceTimer) clearTimeout(practiceTimer);
    practiceTimer = null;
    practiceAnimationToken += 1;
    cur.messages.forEach(function (message) { message.animate = false; });
    cur.locked = false;
    if (cur.nextPhase) {
      state.phase = cur.nextPhase;
      cur.nextPhase = null;
    } else {
      cur.focusNextChoice = true;
    }
    render();
  }

  function afterRender() {
    // 슬라이더는 재렌더 없이 즉시 반영
    if (state.phase === "onboarding") {
      root.querySelectorAll(".slider").forEach(function (sl) {
        sl.addEventListener("input", function () {
          var k = sl.getAttribute("data-type");
          state.form[k] = clampPct(sl.value);
          syncScoreRow(k, { skipSlider: true });
        });
      });
      root.querySelectorAll("[data-num]").forEach(function (input) {
        var k = input.getAttribute("data-num");
        // 입력 중 빈 값은 되돌리지 않고(지우는 중), blur 시점에 정규화한다.
        input.addEventListener("input", function () {
          if (input.value === "") return;
          state.form[k] = clampPct(input.value);
          syncScoreRow(k, { skipNumber: true });
        });
        input.addEventListener("blur", function () {
          state.form[k] = clampPct(input.value);
          syncScoreRow(k);
        });
      });
      updateScoreFoot();
    }
    var conv = root.querySelector(".convo");
    if (conv) {
      conv.scrollTop = conv.scrollHeight;
      conv.querySelectorAll("[data-reveal], [data-typing]").forEach(function (item) {
        item.addEventListener("animationstart", function () {
          conv.scrollTop = conv.scrollHeight;
        }, { once: true });
      });
    }
    if (state.phase === "practice" && state.current && state.current.locked) {
      schedulePracticeAdvance();
    }
    if (pendingFocusSelector) {
      var restoredFocus = root.querySelector(pendingFocusSelector);
      if (restoredFocus) restoredFocus.focus({ preventScroll: true });
      pendingFocusSelector = null;
    } else if (lastRenderedPhase !== state.phase) {
      var pageFocus = state.phase === "practice"
        ? root.querySelector(".practice")
        : root.querySelector(".stage h1, .stage h2");
      if (pageFocus) {
        if (!pageFocus.hasAttribute("tabindex")) pageFocus.setAttribute("tabindex", "-1");
        pageFocus.focus({ preventScroll: true });
      }
      lastRenderedPhase = state.phase;
    } else if (state.phase === "practice" && state.current) {
      if (state.current.locked && state.current.focusSkip) {
        var skipButton = root.querySelector('[data-action="skip-dialogue"]');
        if (skipButton) skipButton.focus({ preventScroll: true });
        state.current.focusSkip = false;
      } else if (!state.current.locked && state.current.focusNextChoice) {
        var nextChoice = root.querySelector(".choice");
        if (nextChoice) nextChoice.focus({ preventScroll: true });
        state.current.focusNextChoice = false;
      }
    }
  }

  // 한 행의 슬라이더·숫자 입력·구간 라벨을 재렌더 없이 서로 맞춘다.
  function syncScoreRow(key, opts) {
    var v = state.form[key];
    var o = opts || {};
    var slider = root.querySelector("#score-" + key);
    if (slider) {
      if (!o.skipSlider) slider.value = v;
      slider.style.setProperty("--pct", v + "%");
    }
    var num = root.querySelector('[data-num="' + key + '"]');
    if (num && !o.skipNumber) num.value = v;
    var badge = root.querySelector('[data-band="' + key + '"]');
    if (badge) badge.textContent = bandLabel(v);
    updateScoreFoot();
  }

  // 백분위는 합계가 정해져 있지 않다. 대신 최고–최저 격차(프로파일 분화 정도)를 보여준다.
  function updateScoreFoot() {
    var spread = formSpread();
    var el = root.querySelector("[data-total]");
    var hint = root.querySelector("[data-hint]");
    if (el) el.innerHTML = "최고–최저 격차 <b>" + spread + "</b>";
    var meter = root.querySelector("[data-meter]");
    if (meter) {
      meter.style.width = spread + "%";
      meter.classList.toggle("off", spread === 0);
    }
    if (hint) {
      if (spread === 0) {
        hint.textContent = "다섯 유형 백분위가 모두 같습니다. 결과지 값을 다시 확인해 주세요. 그대로 진행하면 우세 유형 없이 해석합니다.";
        hint.className = "hint warn";
      } else {
        var c = formBandCounts();
        hint.textContent = "높음 " + c.high + " · 중간 " + c.mid + " · 낮음 " + c.low;
        hint.className = "hint";
      }
    }
  }

  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");

    if (action === "submit-scores") return onSubmitScores();
    if (action === "step-score") {
      var typeKey = btn.getAttribute("data-type");
      var delta = parseInt(btn.getAttribute("data-delta"), 10);
      state.form[typeKey] = clampPct(state.form[typeKey] + delta);
      syncScoreRow(typeKey);
      return;
    }
    if (action === "profile-choice") {
      var field = btn.getAttribute("data-field");
      var value = btn.getAttribute("data-value");
      state.profileDraft[field] = value;
      if (field === "job" && value === "administration") state.profileDraft.projectRole = null;
      pendingFocusSelector =
        '[data-action="profile-choice"][data-field="' + field + '"][data-value="' + value + '"]';
      return render();
    }
    if (action === "confirm-profile") {
      var draft = state.profileDraft;
      var complete = draft.job && draft.recentOpponent && (draft.job !== "research" || draft.projectRole);
      if (!complete || state.profile) return;
      state.profile = Object.freeze({
        job: draft.job,
        projectRole: draft.job === "research" ? draft.projectRole : null,
        recentOpponent: draft.recentOpponent,
      });
      return proceedToBrief();
    }
    if (action === "pick-tie") {
      state.pendingTarget = btn.getAttribute("data-type");
      state.phase = "brief";
      return render();
    }
    if (action === "start-first") {
      var firstTarget = state.pendingTarget || state.lowest[0];
      var firstOpponent = state.profile.recentOpponent;
      state.pendingTarget = null;
      return startPractice(firstTarget, firstOpponent);
    }
    if (action === "skip-dialogue") return skipPracticeReveal();
    if (action === "choose") {
      var idx = parseInt(btn.getAttribute("data-index"), 10);
      var cur = state.current;
      if (!cur || cur.locked) return;
      var choices = currentChoices(cur);
      return applyChoice(choices[idx]);
    }
    if (action === "round") return onRound(btn);
    if (action === "go-summary" || action === "summary-btn") { state.phase = "summary"; return render(); }
    if (action === "restart") return onRestart();
  });

  function onSubmitScores() {
    // 범위는 슬라이더·숫자 입력이 보장(0~100). 격차는 경고만 띄우고 진행을 막지 않는다.
    D.order.forEach(function (k) { state.form[k] = clampPct(state.form[k]); });
    state.scores = {};
    D.order.forEach(function (k) { state.scores[k] = state.form[k]; });
    computeRanks();
    if (!state.profile) {
      state.phase = "profile";
      return render();
    }
    proceedToBrief();
  }

  function proceedToBrief() {
    if (state.lowest.length > 1) {
      state.phase = "tie";
    } else {
      state.pendingTarget = state.lowest[0];
      state.phase = "brief";
    }
    render();
  }

  function onRound(btn) {
    var kind = btn.getAttribute("data-kind");
    if (kind === "opponent") {
      var opponentType = btn.getAttribute("data-opponent");
      if (state.usedOpponents.indexOf(opponentType) >= 0) return;
      return startPractice(lowestUnusedType(), opponentType);
    }
    if (kind === "summary") { state.phase = "summary"; return render(); }
  }

  function onRestart() {
    if (practiceTimer) clearTimeout(practiceTimer);
    practiceTimer = null;
    practiceAnimationToken += 1;
    state.phase = "onboarding";
    state.scores = null;
    state.highest = []; state.lowest = [];
    state.completed = 0;
    state.usedTypes = [];
    state.usedOpponents = [];
    state.history = [];
    state.current = null;
    state.pendingTarget = null;
    state.form = { competing: 50, collaborating: 50, compromising: 50, avoiding: 50, accommodating: 50 };
    __sent = false; __startSent = false; __sid = null;
    render();
  }

  /* ── 결과 자동 전송 (교수자 대시보드 연동) ──
     시작 신호(tkiSendStart)와 완료 결과(tkiSend)를 같은 세션 id로 보내,
     대시보드에서 '시작 대비 완료율'을 계산할 수 있게 한다.
     둘 다 no-cors fire-and-forget이며, 개인 식별 정보는 담지 않는다. */
  var TKI_ENDPOINT = "https://script.google.com/macros/s/AKfycbzGWcr-3Y_KhBngewiE5POu6iGd8dlVMPD1b0S0MwSx8UjKcS9W2U7IugfBTbBLYyt2vQ/exec";
  var __sent = false, __startSent = false, __sid = null;

  function ensureSid() {
    if (!__sid) __sid = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return __sid;
  }
  function tkiPost(payload) {
    if (!TKI_ENDPOINT) return;
    try {
      fetch(TKI_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  // 세션 시작(첫 실습 진입) 시 1회. 중도 이탈 세션도 이 신호는 남아 완료율의 분모가 된다.
  function tkiSendStart() {
    if (__startSent) return;
    __startSent = true;
    // 프로파일·백분위를 함께 싣는다. 중도 이탈 세션도 '누가 어디서 멈췄는지'를
    // 볼 수 있어야 완료율이 숫자 하나로 끝나지 않는다.
    tkiPost({
      id: ensureSid(), event: "start", startedAt: new Date().toISOString(),
      profile: state.profile, scores: state.scores, scoreScale: "percentile",
    });
  }

  // 종합 화면 도달(끝까지 완료) 시 1회. 완료율의 분자가 된다.
  function tkiSend() {
    if (__sent || !state.history.length) return;
    __sent = true;
    tkiPost({
      id: ensureSid(), event: "complete", submittedAt: new Date().toISOString(),
      profile: state.profile, scores: state.scores, scoreScale: "percentile",
      practices: state.history.map(function (h) {
        return {
          scenarioKey: h.scenarioKey, target: h.target, opponentType: h.opponentType,
          requires: h.requires, startState: h.startState, endingKey: h.endingKey,
          durationSec: h.durationSec == null ? null : h.durationSec,
          decisions: h.path.map(function (p) { return { stage: p.stage, mode: p.mode, fit: p.fit }; })
        };
      })
    });
  }

  /* ============================ 시작 ============================ */
  render();
})();
