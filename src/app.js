/*
 * TKI v3 — 선택지 분기형 갈등 코치 (앱 로직)
 * 단일 IIFE. 외부 통신·저장소 없음. 상태는 메모리에만 존재.
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
    form: { competing: 6, collaborating: 6, compromising: 6, avoiding: 6, accommodating: 6 },
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
  function fitLabel(fit) {
    return D.feedback.fitLabels[fit];
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

  /* --------------------------- 점수/랭크 처리 --------------------------- */
  function computeRanks() {
    var s = state.scores;
    var vals = D.order.map(function (k) { return s[k]; });
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    state.highest = D.order.filter(function (k) { return s[k] === max; });
    state.lowest = D.order.filter(function (k) { return s[k] === min; });
  }

  // 아직 실습하지 않은 유형 중 점수가 가장 낮은 유형
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
    fb.ending = D.endings[cur.endingKey];

    // 2. 결정별 해설과 상황 단서
    fb.decisionReviews = path.map(function (p, i) {
      var meta = p.feedback || {};
      return {
        n: i + 1,
        purpose: meta.purpose || (D.decisionPurposes && D.decisionPurposes[p.stage]) || "",
        label: D.types[p.mode].label,
        mode: p.mode,
        fit: p.fit,
        fitLabel: fitLabel(p.fit),
        text: p.text || "",
        reply: p.reply || "",
        stateBefore: p.stateBefore,
        stateAfter: p.stateAfter,
        rationale: meta.rationale || "",
        taskEffect: meta.taskEffect || D.types[p.mode].taskImpact || "",
        relationshipEffect: meta.relationshipEffect || D.types[p.mode].relationshipImpact || "",
        risk: meta.risk || D.types[p.mode].overuseRisk || "",
        nextFocus: meta.nextFocus || "",
        recommendedMode: meta.recommendedMode || null,
      };
    });

    fb.fitCounts = { good: 0, ok: 0, poor: 0 };
    path.forEach(function (p) { fb.fitCounts[p.fit] += 1; });
    fb.stateShift = path[0].stateBefore + " → " + path[path.length - 1].stateAfter;
    fb.contextPoints = [
      "우선 다룰 요구: " + cur.scenario.requires,
      "선택 적합도: 잘 맞음 " + fb.fitCounts.good + "회 / 무난함 " + fb.fitCounts.ok +
        "회 / 아쉬움 " + fb.fitCounts.poor + "회",
      "상대 심리: " + fb.stateShift,
      profileGuidance(state.profile),
    ];

    // 3. 나타난 경향
    fb.dominant = dominantModes(path);
    var usedModeCount = Object.keys(path.reduce(function (acc, p) {
      acc[p.mode] = true;
      return acc;
    }, {})).length;
    if (usedModeCount === 1) {
      fb.flexibilityPoints = D.feedback.flexibility.one;
    } else if (usedModeCount === 2) {
      fb.flexibilityPoints = D.feedback.flexibility.two;
    } else {
      fb.flexibilityPoints = D.feedback.flexibility.varied;
    }

    // 4. 진단 대조
    var dom = fb.dominant[0];
    var domLabel = D.types[dom].label;
    var allScoresTied =
      state.highest.length === D.order.length && state.lowest.length === D.order.length;
    if (allScoresTied) {
      fb.contrastPoints = [
        "진단 결과: 다섯 유형 동점",
        "점수상 우세 유형은 없으며, 이번 실습에서는 " + domLabel + " 반응이 가장 자주 나타났습니다.",
      ];
    } else if (state.highest.indexOf(dom) >= 0) {
      fb.contrastPoints = [
        "진단상 높은 유형: " + domLabel,
        "실습에서도 같은 방식이 주요 반응으로 나타났습니다.",
      ];
    } else if (state.lowest.indexOf(dom) >= 0) {
      fb.contrastPoints = [
        "진단상 낮은 유형: " + domLabel,
        "실습에서 여러 번 시도해 평소와 다른 대응을 연습했습니다.",
      ];
    } else {
      fb.contrastPoints = [
        "진단상 중간 유형: " + domLabel,
        "실습에서는 자주 사용해 상황에 따라 대응을 바꿔보았습니다.",
      ];
    }

    // 4. 나았던 선택 (적합도 최고 분기)
    var bestIdx = 0, bestV = fitVal(path[0].fit);
    path.forEach(function (p, i) { if (fitVal(p.fit) > bestV) { bestV = fitVal(p.fit); bestIdx = i; } });
    fb.best = { n: bestIdx + 1, item: path[bestIdx], fit: path[bestIdx].fit, requires: cur.scenario.requires };

    // 5. 아쉬운 선택 (적합도 최저 분기 — 나았던 분기와 겹치지 않게)
    var worstIdx = -1, worstV = 2;
    path.forEach(function (p, i) {
      var v = fitVal(p.fit);
      if (i !== bestIdx && v < worstV) { worstV = v; worstIdx = i; }
    });
    if (worstIdx < 0) { worstIdx = bestIdx; worstV = bestV; } // 결정 지점이 하나뿐인 경우
    fb.worst = { n: worstIdx + 1, item: path[worstIdx], hasPoor: worstV < 0 };
    // 그 분기에서 학습자가 실제로 마주했던 보기 중 가장 적합한 대안(good 보기)
    var worstItem = path[worstIdx];
    var altChoices = worstItem.stage === 1
      ? cur.scenario.beat1.choices
      : worstItem.stage === 2
        ? cur.scenario.beat2[worstItem.node].choices
        : cur.scenario.beat3.choices;
    var altChoice = altChoices.filter(function (c) { return c.fit === "good"; })[0] || altChoices[0];
    fb.worst.alt = altChoice;
    fb.worst.signal = D.types[worstItem.mode].signal;
    fb.nextAction = altChoice.feedback && altChoice.feedback.nextFocus
      ? altChoice.feedback.nextFocus
      : D.types[cur.target].watch;

    return fb;
  }

  /* --------------------------- 종합 피드백 --------------------------- */
  function buildSummary() {
    var allPath = [];
    var fitCounts = { good: 0, ok: 0, poor: 0 };
    var modeCounts = {};
    var stageStats = {
      1: { count: 0, score: 0 },
      2: { count: 0, score: 0 },
      3: { count: 0, score: 0 },
    };
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
        stageStats[p.stage].count += 1;
        stageStats[p.stage].score += fitVal(p.fit);
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
        "진단 점수는 여러 유형이 동점이었으므로, 실습에서 " + practicedCount +
        "회 나타난 " + D.types[practicedKey].label + " 반응을 실제 행동상의 주요 경향으로 해석했습니다.";
    } else {
      diagnosticLink =
        "진단상 높은 " + D.types[highKey].label + " 반응은 실제 " + allPath.length +
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
      : "여러 대응 유형을 사용해 전략 범위는 넓었습니다. 전략을 바꾼 시점이 상대 반응과 제약 변화에 근거했는지 확인해보세요.";

    function focusLabel(value) {
      return value >= 1.4 ? "높은 편" : value <= 0.6 ? "낮은 편" : "중간 수준";
    }
    var taskAverage = taskSum / allPath.length;
    var relationAverage = relationSum / allPath.length;
    var balanceDirection = Math.abs(taskAverage - relationAverage) < 0.35
      ? "두 축을 비교적 균형 있게 사용했습니다."
      : taskAverage > relationAverage
        ? "상대 관점 확인보다 자기 입장과 과업 추진을 우선하는 선택이 더 많았습니다."
        : "자기 입장과 과업 추진보다 상대 관점과 관계를 우선하는 선택이 더 많았습니다.";
    var balancePoint =
      "자기 입장·과업 추진은 " + focusLabel(taskAverage) + ", 상대 관점·관계 고려는 " +
      focusLabel(relationAverage) + "이었습니다. " + balanceDirection;
    var patternPoints = [modeUsePoint, flexibilityPoint, diagnosticLink, balancePoint];

    var bestStage = 1, worstStage = 1;
    [1, 2, 3].forEach(function (stage) {
      var avg = stageStats[stage].score / stageStats[stage].count;
      var bestAvg = stageStats[bestStage].score / stageStats[bestStage].count;
      var worstAvg = stageStats[worstStage].score / stageStats[worstStage].count;
      if (avg > bestAvg) bestStage = stage;
      if (avg < worstAvg) worstStage = stage;
    });
    var situationPoint =
      "상황에 잘 맞은 선택 " + fitCounts.good + "회, 무난한 선택 " + fitCounts.ok +
      "회, 아쉬운 선택 " + fitCounts.poor + "회였습니다. 보완 우선 단계는 '" +
      D.decisionPurposes[worstStage] + "'입니다.";

    var improved = 0, unchanged = 0, worsened = 0;
    state.history.forEach(function (h) {
      var first = h.path[0], last = h.path[h.path.length - 1];
      var delta = stateIndex(last.stateAfter) - stateIndex(first.stateBefore);
      if (delta > 0) improved += 1;
      else if (delta < 0) worsened += 1;
      else unchanged += 1;
    });
    var endingBreakdown = {};
    state.history.forEach(function (h) {
      var label = D.endings[h.endingKey].label;
      endingBreakdown[label] = (endingBreakdown[label] || 0) + 1;
    });
    var endingText = Object.keys(endingBreakdown).map(function (label) {
      return label + " " + endingBreakdown[label] + "회";
    }).join(", ");
    var riskyEndingCount = state.history.filter(function (h) {
      return h.endingKey === "patched" || h.endingKey === "stuck";
    }).length;
    var partialEndingCount = state.history.filter(function (h) {
      return h.endingKey === "partial";
    }).length;
    var practicalOutcome = riskyEndingCount > 0
      ? "봉합 또는 교착 결말이 포함되어 있어 대화가 끝났더라도 실행 동의가 충분하지 않을 수 있습니다. 실무에서는 종료 전에 담당자·기한·확인 방법을 명시하고, 상대가 실제로 동의한 조건을 다시 확인해야 합니다."
      : partialEndingCount > 0
        ? "부분 해결은 당장의 진행 조건은 만들었지만 남은 쟁점이 다시 갈등으로 이어질 수 있다는 뜻입니다. 실무에서는 미해결 항목, 재논의 시점, 최종 결정권자를 함께 기록해 두는 것이 필요합니다."
        : "해결 결말은 과업 조건과 상대의 참여 의지가 함께 확보됐다는 뜻입니다. 실무에서도 합의 내용을 담당자·기한·확인 방법으로 구체화해야 같은 수준의 실행력을 유지할 수 있습니다.";
    var outcomePoints = [
      "상대 심리가 나아진 실습 " + improved + "회, 유지된 실습 " + unchanged + "회, 경직된 실습 " + worsened + "회였습니다.",
      "실습 결말은 " + endingText + "였습니다.",
      "실무 시사점: " + practicalOutcome,
      situationPoint,
    ];

    // 확인된 강점 — 어떤 선택을 했는지(근거)가 아니라, 잘 통한 방식의 강점을 해석해 보여준다.
    var goodModes = {};
    allPath.forEach(function (p) { if (p.fit === "good") goodModes[p.mode] = (goodModes[p.mode] || 0) + 1; });
    var goodModeKeys = D.order.filter(function (k) { return goodModes[k]; })
      .sort(function (a, b) { return goodModes[b] - goodModes[a]; });
    var strengthEvidence = [];
    if (goodModeKeys.length) {
      strengthEvidence.push(D.types[goodModeKeys[0]].label + ": " + D.types[goodModeKeys[0]].strength + ".");
      strengthEvidence.push("이번 실습에서 이 방식이 상황이 요구한 것과 잘 맞아, 대화를 실제로 진전시키는 힘이 됐어요.");
      if (goodModeKeys.length > 1) {
        strengthEvidence.push("여기에 " + D.types[goodModeKeys[1]].label + " 방식도 함께 통해, 상황에 따라 대응을 바꿀 줄 아는 유연함도 보였어요.");
      }
    } else {
      strengthEvidence.push("이번엔 상황 요구에 딱 맞은 선택이 많지 않았어요. 그래도 여러 대응을 직접 시도하며 자신의 대응 폭을 확인한 것 자체가 의미 있는 출발이에요.");
    }

    // 성장 지점 — 개별 선택 근거가 아니라 세 실습을 통틀어 반복된 경향을 해석한다.
    var cautionEvidence = [];
    cautionEvidence.push(Math.abs(taskAverage - relationAverage) < 0.35
      ? "과업 추진과 관계 고려를 비교적 균형 있게 오갔어요. 다음엔 상황마다 어느 쪽에 무게를 둘지 의식적으로 정해보면 더 좋아요."
      : taskAverage > relationAverage
        ? "전반적으로 자기 입장과 과업 추진을 앞세우는 쪽으로 기울었어요. 결론을 내기 전에 상대의 관점을 한 번 더 확인하는 여유를 더해보세요."
        : "전반적으로 상대 관점과 관계를 우선하는 쪽으로 기울었어요. 관계를 지키면서도 자신의 입장과 실행 기준을 분명히 밝히는 연습을 더해보세요.");
    cautionEvidence.push(D.types[unusedLowKey].label + ": " + D.types[unusedLowKey].underusedOpportunity + " 아직 덜 꺼내 쓴 방식이니 다음엔 의식적으로 시도해보세요.");
    if (fitCounts.poor > 0 || fitCounts.ok > 0) {
      cautionEvidence.push("특히 '" + D.decisionPurposes[worstStage] + "' 단계에서 상황 요구를 한 번 더 반영할 여지가 있었어요.");
    }

    // ── 학습 곡선 (I): 회차별 상황 적합도 추이 ──
    var learningCurve = state.history.map(function (h, i) {
      var counts = { good: 0, ok: 0, poor: 0 };
      h.path.forEach(function (p) { counts[p.fit] += 1; });
      var score = h.path.reduce(function (a, p) { return a + fitVal(p.fit); }, 0);
      var first = h.path[0], last = h.path[h.path.length - 1];
      var e = D.endings[h.endingKey];
      return {
        n: i + 1,
        targetLabel: D.types[h.target].label,
        opponentLabel: optionLabel("opponent", h.opponentType),
        counts: counts,
        score: score,
        total: h.path.length,
        stateDelta: stateIndex(last.stateAfter) - stateIndex(first.stateBefore),
        modePath: h.path.map(function (p) { return D.types[p.mode].label; }).join(" → "),
        endingLabel: e.label,
        endingTone: e.tone,
      };
    });
    var curveDiff = learningCurve.length >= 2
      ? learningCurve[learningCurve.length - 1].score - learningCurve[0].score
      : 0;
    var curveTrend = learningCurve.length < 2
      ? "실습이 한 번뿐이라 회차 간 추이는 아직 볼 수 없습니다."
      : curveDiff >= 1
        ? "회차를 거치며 상황 적합도가 올라갔습니다. 앞 실습에서 얻은 감각이 뒤 실습으로 이어졌다는 신호입니다."
        : curveDiff <= -1
          ? "뒤 회차로 갈수록 적합도가 내려갔습니다. 후반 상황이 더 까다로웠는지, 익숙한 방식을 조건이 달라진 장면에도 그대로 적용하지는 않았는지 살펴보세요."
          : "회차별 적합도는 비슷한 수준을 유지했습니다. 큰 기복 없이 일관된 대응을 보였습니다.";

    // 코칭 메시지 — 강점을 먼저 인정하고, 보완점을 다음 목표로 제시하는 코칭 톤
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
      "다음 목표는 '" + D.decisionPurposes[worstStage] + "' 단계에서 담당자·기한·확인 방법까지 함께 정해 보는 것입니다. 오늘 교육에서 이 점을 한 번 더 생각해보세요!",
    ];

    return {
      pattern: patternText,
      patternPoints: patternPoints,
      outcomePoints: outcomePoints,
      strengthEvidence: strengthEvidence,
      cautionEvidence: cautionEvidence,
      coaching: coaching,
      learningCurve: learningCurve,
      curveTrend: curveTrend,
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

  /* ---- 온보딩 (점수 입력) ---- */
  function renderOnboarding() {
    var rows = D.order.map(function (k) {
      var t = D.types[k];
      var v = state.form[k];
      var pct = Math.round((v / 12) * 100);
      return (
        '<div class="score-row">' +
        '<div class="score-info">' +
        '<label class="score-label" for="score-' + k + '">' + t.label + '<span class="en">' + t.en + "</span></label>" +
        proseParas(esc(t.tendency), "score-desc") +
        "</div>" +
        '<div class="score-ctl">' +
        '<button type="button" class="step-btn" data-action="step-score" data-type="' + k +
        '" data-delta="-1" aria-label="' + t.label + ' 1점 낮추기">−</button>' +
        '<input id="score-' + k + '" class="slider" type="range" min="0" max="12" step="1" value="' + v +
        '" data-type="' + k + '" style="--pct:' + pct + '%" aria-describedby="score-value-' + k + '" />' +
        '<button type="button" class="step-btn" data-action="step-score" data-type="' + k +
        '" data-delta="1" aria-label="' + t.label + ' 1점 높이기">+</button>' +
        "</div>" +
        '<output id="score-value-' + k + '" class="score-val" for="score-' + k + '" data-out="' + k + '">' + v + "</output>" +
        "</div>"
      );
    }).join("");
    var total = D.order.reduce(function (a, k) { return a + state.form[k]; }, 0);
    var meterPct = Math.min(100, Math.round((total / 60) * 100));

    return (
      '<section class="card intro">' +
      '<div class="ob-grid">' +
      '<div class="ob-side">' +
      '<div class="ob-kicker">TKI 기반 갈등 대응 코칭</div>' +
      "<h1>" + C.onboarding.title + "</h1>" +
      '<p class="lead">이미 받으신 <b>TKI 검사 결과</b>에서 출발합니다.<br>정답을 맞히는 자리가 아니라, ' +
      "상황에 맞는 대응을 골라보며 자신의 경향을 관찰하는 자리입니다.</p>" +
      '<ol class="ob-how">' +
      "<li><b>결과 입력</b><span>TKI 유형별 점수와 업무맥락을 안내에 따라 입력합니다.</span></li>" +
      "<li><b>시나리오 실습</b><span>실제 업무 갈등 장면에서 대응을 선택합니다.</span></li>" +
      "<li><b>코칭 피드백</b><span>선택 경로를 진단 결과와 대조해 해석합니다.</span></li>" +
      "</ol>" +
      '<p class="ob-privacy">입력한 값은 브라우저 메모리에만 남고 어디에도 저장·전송되지 않습니다.</p>' +
      "</div>" +
      '<div class="ob-panel">' +
      '<div class="ob-panel-head"><h2 class="ob-panel-title">검사 결과 입력</h2>' +
      '<p class="ob-panel-sub">각 유형 <b>0~12점</b> · 다섯 유형 합계는 보통 <b>30점</b>입니다.</p></div>' +
      '<div class="scores">' + rows + "</div>" +
      '<div class="score-foot">' +
      '<div class="total-wrap"><div class="total" data-total>합계 <b>' + total + "</b> / 30</div>" +
      '<div class="total-meter" aria-hidden="true"><span class="total-fill" data-meter style="width:' +
      meterPct + '%"></span><span class="total-tick"></span></div></div>' +
      '<div class="hint" data-hint role="status" aria-live="polite"></div>' +
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
      '<p class="micro center">프로파일은 브라우저 메모리에만 유지되며 저장·전송되지 않습니다.</p>' +
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
        ? "다섯 유형 점수가 모두 같습니다. 뚜렷한 우세 유형을 단정하지 않고, 이번 세션에서 먼저 관찰할 유형을 하나 골라 주세요."
        : "점수가 가장 낮은 유형이 여럿입니다. 이번 세션에서 먼저 다뤄볼 유형을 하나 골라 주세요.") +
      "</p>" +
      '<div class="choices">' + opts + "</div>" +
      "</section>"
    );
  }

  /* ---- 진단 브리핑 (STEP 1) ---- */
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
    var valuePts = D.order.map(function (k, i) { return pt(i, (s[k] / 12) * R); });
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
    return '<svg viewBox="0 0 360 306" role="img" aria-label="다섯 유형 점수 레이더 차트">' +
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
      var w = maxv ? Math.round((v / 12) * 100) : 0;
      var isHigh = state.highest.indexOf(k) >= 0;
      var isLow = state.lowest.indexOf(k) >= 0;
      var tag = allTied
        ? ' <span class="pill tie">동점</span>'
        : isHigh
          ? ' <span class="pill high">' + (state.highest.length > 1 ? "공동 최고" : "최고") + "</span>"
          : isLow ? ' <span class="pill low">최저</span>' : "";
      return (
        '<div class="bar-row">' +
        '<div class="bar-name">' + t.label + tag + "</div>" +
        '<div class="bar-track"><div class="bar-fill' + (isHigh && !allTied ? " hi" : "") + '" style="width:' + w + '%"></div></div>' +
        '<div class="bar-num">' + v + "</div>" +
        "</div>"
      );
    }).join("");

    var targetType = D.types[target];
    var tendencyLine = allTied
      ? "다섯 유형 점수가 모두 같아 뚜렷한 우세 유형을 단정하기 어렵습니다. 아래 내용은 이번에 선택한 " +
        targetType.label + " 행동을 관찰하기 위한 참고 설명입니다."
      : state.highest.length > 1
        ? state.highest.map(function (key) { return D.types[key].label; }).join("·") +
          "이 공동 최고입니다. 세부 설명은 그중 " + high.label + "을 기준으로 제시합니다. " + high.tendencyDetail
        : high.label + " — " + high.tendencyDetail;
    var goalLine = allTied
      ? "점수상 우세 유형이 없으므로 이번에는 " + targetType.label +
        " 행동을 의식적으로 관찰합니다. 특히 " + targetType.watch
      : high.label + "의 강점을 유지하되, 이번에는 다음 행동을 의식합니다: " + high.goal +
        ". 동시에 " + targetType.label + "의 행동도 선택지에 올려보는 연습입니다. 특히 " + targetType.watch;

    var heroType = allTied
      ? "다섯 유형 동점"
      : state.highest.map(function (key) { return D.types[key].label; }).join(" · ");
    var heroSub = allTied
      ? "이번 관찰 대상: " + targetType.label
      : state.highest.length > 1 ? "공동 최고 · 설명 기준: " + high.label : high.en;
    var heroLine = allTied
      ? "뚜렷한 우세 유형을 단정하지 않고, 이번 세션에서는 " + targetType.label + " 행동을 중심으로 관찰합니다."
      : high.tendency;

    // ── 결과 심층 해석 (C): 점수 격차 기반 한 줄 + 상위 두 유형 결합 해석 ──
    var spread = maxv - minv;
    var gapLine;
    if (allTied) {
      gapLine = "다섯 유형 점수가 모두 " + maxv + "점으로 완전히 같습니다. 뚜렷한 우세 유형이 없어, 아래 해석은 이번에 관찰할 <b>" +
        targetType.label + "</b> 행동을 기준으로 한 참고 설명입니다.";
    } else if (spread >= 6) {
      gapLine = "최고 " + high.label + "(" + maxv + "점)과 최저(" + minv + "점)의 격차가 <b>" + spread +
        "점</b>으로 큽니다. 특정 대응 방식에 뚜렷하게 기대는 <b>분화된 프로파일</b>로, 강점이 선명한 만큼 그 방식이 맞지 않는 상황에서 다른 대응으로 <b>전환</b>하는 것이 이번 연습의 관건입니다.";
    } else if (spread >= 3) {
      gapLine = "최고점과 최저점의 격차가 <b>" + spread +
        "점</b>으로, 선호하는 방식이 있으면서도 상황에 따라 다른 방식을 함께 쓰는 <b>중간 정도로 분화된 프로파일</b>입니다. 우세 방식을 기본값으로 삼되, 상황 단서에 맞춰 대응을 조정하는 감각을 다듬어볼 수 있습니다.";
    } else {
      gapLine = "다섯 유형의 점수 격차가 <b>" + spread +
        "점</b>에 불과해 특정 방식에 치우치지 않는 <b>고른 프로파일</b>입니다. 어떤 상황에도 유연하게 대응할 잠재력인 동시에, 결정적 순간에 우선순위가 흐려지지 않도록 '지금 무엇이 가장 중요한가'를 먼저 정하는 연습이 도움이 됩니다.";
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
        comboLine = "특히 점수가 가장 높은 두 유형인 <b>" + D.types[t1].label + "</b>과 <b>" + D.types[t2].label + "</b>을 함께 놓고 보면, 한 유형만으로는 드러나지 않는 대응의 결이 보입니다. " + comboBody;
      }
    }

    // ── 이번에 넓힐 유형 (A): 연습 대상 target 유형 전용 설명 (동점 시 hero와 중복되므로 생략) ──
    var targetBlock = "";
    if (!allTied) {
      var tIntro = state.lowest.length > 1
        ? "진단상 가장 낮은 축에 속해, 이번 세션에서 먼저 연습하기로 한 유형입니다."
        : "진단상 가장 낮게 나타난 유형으로, 여기에 아직 꺼내 쓰지 않은 대응 여지가 있습니다.";
      targetBlock =
        '<div class="target-block">' +
        '<div class="tb-kicker">이번에 넓힐 유형 — 아직 덜 쓰는 대응</div>' +
        '<div class="tb-title">' + esc(targetType.label) +
        '<span class="tb-en">' + esc(targetType.en) + "</span>" +
        '<span class="req-chip">우선 요구 · ' + esc(targetType.requires) + "</span></div>" +
        proseParas(esc(tIntro) + " " + esc(targetType.underusedOpportunity), "tb-lead") +
        '<div class="tb-grid">' +
        '<div class="tb-item"><div class="tb-label">이 대응이 가진 힘</div>' + proseParas(esc(targetType.strength)) + "</div>" +
        '<div class="tb-item"><div class="tb-label">이럴 때 효과적</div>' + proseParas(esc(targetType.effectiveWhen)) + "</div>" +
        "</div></div>";
    }

    var opponentLabel = optionLabel("opponent", state.profile.recentOpponent);

    return (
      '<section class="card brief">' +
      '<div class="tag-row"><span class="tag">' + esc(C.brief.tag) + "</span></div>" +
      "<h2>" + esc(C.brief.title) + "</h2>" +
      '<div class="profile-summary"><span>확정 프로파일</span><b>' + esc(profileRoleLabel(state.profile)) +
      "</b><span>최근 부담 상대</span><b>" + esc(opponentLabel) + "</b></div>" +

      '<div class="hero-result">' +
      '<div class="hero-kicker">' + (allTied ? "RESULT · TIE" : "주요 대응 경향 — 지금 갈등을 보는 렌즈") + "</div>" +
      '<div class="hero-type">' + esc(heroType) + '<span class="hero-en">' + esc(heroSub) + "</span>" +
      '<span class="req-chip">우선 요구 · ' + esc(high.requires) + "</span></div>" +
      proseParas(esc(heroLine), "hero-line") +
      "</div>" +

      '<div class="viz-grid">' +
      '<div class="viz-box"><div class="vb-label">유형 밸런스</div><div class="radar-wrap">' + radarSvg(s) + "</div></div>" +
      '<div class="viz-box"><div class="vb-label">점수 (0–12)</div><div class="bars">' + bars + "</div></div>" +
      "</div>" +

      '<div class="insight-block"><div class="vb-label">결과 심층 해석</div>' +
      proseParas(gapLine, "insight-gap") +
      (comboLine ? proseParas(comboLine, "insight-gap") : "") +
      "</div>" +

      '<div class="axes-block"><div class="vb-label">내 성향이 작용하는 두 축</div>' +
      '<div class="dc-axes">' +
      '<div class="dc-axis"><div class="dc-axis-h">과업 영향</div>' + proseParas(esc(high.taskImpact)) + "</div>" +
      '<div class="dc-axis"><div class="dc-axis-h">관계 영향</div>' + proseParas(esc(high.relationshipImpact)) + "</div>" +
      "</div></div>" +

      '<details class="more brief-more"><summary>이 경향 자세히 보기 — 강점·주의·효과적 조건·심층 해설</summary>' +
      '<div class="brief-grid">' +
      '<div class="brief-item"><div class="bi-label">강점 상세</div>' +
      pointList(splitSentences(high.strengthDetail), "readable-points brief-points") + "</div>" +
      '<div class="brief-item"><div class="bi-label">주의점 · 과용 위험</div>' +
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
      '<p class="micro">※ 원점수 순위를 바탕으로 한 <b>상대적 대응 경향</b> 해석입니다. 개인의 성격을 단정하는 평가가 아닙니다.</p>' +
      '<button class="btn primary big" data-action="start-first">' +
      esc(opponentLabel) + "와 첫 실습 시작 →</button>" +
      "</section>"
    );
  }
  function briefItem(label, body) {
    return '<div class="brief-item"><div class="bi-label">' + label + "</div>" +
      pointList(splitSentences(body), "readable-points brief-points") + "</div>";
  }

  /* ---- 실습 (STEP 2·3) ---- */
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

  /* ---- 미니 피드백 (STEP 4) ---- */
  function renderFeedback() {
    var fb = buildMiniFeedback();
    state._fb = fb;

    var domNames = fb.dominant.map(function (m) { return D.types[m].label; }).join(", ");
    var heroLine = "이번 실습에서는 <b>" + esc(domNames) + "</b> 방식이 가장 자주 나타났고, 대화는 <b>" +
      esc(josaRo(fb.ending.label)) + "</b> 마무리됐습니다.";
    var heroStats =
      '<span class="stat-chip st-good">잘 맞음 ' + fb.fitCounts.good + "회</span>" +
      '<span class="stat-chip st-ok">무난함 ' + fb.fitCounts.ok + "회</span>" +
      '<span class="stat-chip st-poor">아쉬움 ' + fb.fitCounts.poor + "회</span>";
    // 나타난 대응 경향 — 한 줄 요약 + 자세한 설명(진단 대조 포함)
    var reqTerm = state.current.scenario.requires;
    var usedModes = {};
    fb.path.forEach(function (p) { usedModes[p.mode] = true; });
    var usedCount = Object.keys(usedModes).length;
    var tendencyLead = usedCount >= 3
      ? "이번 실습에서는 세 번의 결정에서 <b>각기 다른 방식</b>을 꺼내 보셨어요."
      : "이번 실습에서 가장 자주 꺼낸 대응은 <b>" + esc(domNames) + "</b> 방식이었어요.";
    var flexProse = usedCount === 1
      ? "세 번의 결정에서 줄곧 같은 방식을 유지했습니다. 상황이 바뀌어도 흔들리지 않은 일관성은 분명한 강점이지만, 다른 대응으로 바꿔야 할 신호를 놓치지는 않았는지 한 번쯤 돌아보면 좋아요."
      : usedCount === 2
        ? "상대의 반응에 따라 두 가지 방식을 오가며 조정했어요. 대응을 바꾼 그 순간이 실제 상황 단서와 잘 맞았는지 살펴보면 전략이 한층 정교해집니다."
        : "세 번 모두 다른 방식을 시도했네요. 대응의 폭이 넓다는 건 좋은 신호예요. 다만 그 전환이 그때그때의 상황 근거에 따른 선택이었는지 확인해보면 더 단단해집니다.";
    var dom0 = fb.dominant[0];
    var allTiedScores = state.highest.length === D.order.length && state.lowest.length === D.order.length;
    var contrastProse = allTiedScores
      ? "진단 점수가 모두 같아 뚜렷한 우세 유형은 없었는데, 이번엔 " + esc(domNames) + " 방식을 주로 꺼내 보셨네요."
      : state.highest.indexOf(dom0) >= 0
        ? "진단에서도 높게 나온 " + esc(D.types[dom0].label) + " 방식이 실습에서도 그대로 나왔어요. 평소 가장 손에 익은 대응이 자연스럽게 나온 셈이에요."
        : state.lowest.indexOf(dom0) >= 0
          ? "흥미로운 점은, 진단에서는 낮게 나온 " + esc(D.types[dom0].label) + " 방식을 이번엔 여러 번 시도했다는 거예요. 평소와 다른 카드를 의식적으로 꺼내 본 거죠."
          : "진단상 중간이던 " + esc(D.types[dom0].label) + " 방식을 이번엔 주로 활용하며 상황에 맞춰 움직였어요.";
    var tendencyBlock =
      '<div class="fb-block reflect tendency-box"><div class="fb-h">나타난 대응 경향</div>' +
      '<p class="fb-lead">' + tendencyLead + "</p>" +
      proseParas(flexProse + " " + contrastProse) +
      "</div>";

    var worstFit = fb.worst.item.fit;
    var optimal = worstFit === "good"; // 모든 갈림길에서 상황에 맞는 선택을 이어감
    var worstMeta = fb.worst.item.feedback || {};
    // "이렇게 말했다면" — 그 갈림길에서 실제로 고를 수 있었던 상황 적합(good) 대사
    var altLine = fb.worst.alt && fb.worst.alt.text
      ? '<div class="fb-alt"><span class="fb-alt-label">이렇게 말했다면 (결정 ' + fb.worst.n + ')</span>' +
        '<p class="fb-alt-quote">' + esc(stripOuterQuotes(fb.worst.alt.text)) + "</p>" +
        (fb.worst.alt.mode
          ? '<span class="fb-alt-reco">이 장면 권장 · ' + esc(D.types[fb.worst.alt.mode].label) + "</span>"
          : "") +
        "</div>"
      : "";
    // 잘한 점 — 실제 적합도에 맞춰 친근하게 서술
    var bestMode = D.types[fb.best.item.mode].label;
    var bestMeta = fb.best.item.feedback || {};
    var bestReason = bestMeta.rationale
      ? firstSentence(bestMeta.rationale)
      : bestMode + " 방식으로 상황에 맞게 대응했습니다.";
    var goodProse = fb.best.fit === "good"
      ? "결정 " + fb.best.n + "에서 <b>" + bestMode + "</b> 방식을 택한 게 이번 실습에서 가장 잘 맞은 선택이었어요. " + esc(bestReason)
      : fb.best.fit === "ok"
        ? "가장 무난했던 건 결정 " + fb.best.n + "의 <b>" + bestMode + "</b> 방식이에요. 큰 무리 없이 대화를 이어갔습니다."
        : "세 결정 모두 상황이 요구한 것과는 거리가 있었지만, 그중에선 결정 " + fb.best.n + "의 <b>" + bestMode + "</b> 방식이 상대적으로 나았어요.";

    // 아쉬운 점 — 친근하게 + '이렇게 말했다면' 대안
    var worstProse;
    if (worstFit === "poor") {
      worstProse = "조금 아쉬웠던 건 결정 " + fb.worst.n + "이에요. <b>" + esc(D.types[fb.worst.item.mode].label) +
        "</b> 방식이 상대에게는 ‘" + esc(fb.worst.signal) + "’처럼 읽혔을 수 있어요. " +
        esc(firstSentence(worstMeta.risk || worstMeta.rationale));
    } else if (!optimal) {
      worstProse = "결정 " + fb.worst.n + "은 무난했지만, 이 상황이 바란 " +
        esc(quotedJosa(reqTerm, "을", "를")) + " 조금 더 살릴 여지가 있었어요.";
    } else {
      worstProse = "이번엔 세 결정 모두 상황의 핵심 요구를 잘 반영했어요. 크게 아쉬운 지점은 없지만, 같은 방식이 늘 통하는 건 아니니 다음엔 조건이 달라지는 순간을 함께 살펴보면 좋아요.";
    }

    // ── 실습 결과 종합 해석 ──
    var fc = fb.fitCounts;
    var firstState = state.current.path[0].stateBefore;
    var lastState = state.current.path[state.current.path.length - 1].stateAfter;
    var stateDelta = stateIndex(lastState) - stateIndex(firstState);
    var taskSynth = fc.good >= 2
      ? "세 번의 선택이 대체로 상황의 핵심 조건을 직접 다뤄, 일을 실제로 굴러가게 하는 힘이 있었어요."
      : fc.poor >= 2
        ? "핵심 제약을 정면으로 다루지 못한 선택이 많아, 일정·품질·책임 같은 실행 조건이 다소 흐릿하게 남았어요."
        : "선택마다 과업을 밀어붙인 정도가 달랐어요. 방향은 열었지만 핵심 조건을 끝까지 못 박는 데는 아쉬움이 남습니다.";
    var relSynth = stateDelta > 0
      ? "상대의 경계도 " + firstState + "에서 " + josaRo(lastState) + " 풀리며, 신뢰를 쌓는 쪽으로 이어졌어요."
      : stateDelta < 0
        ? "관계 면에서는 대화가 이어질수록 상대가 " + josaRo(lastState) + " 움츠러들어, 약간의 부담이 남았을 수 있어요."
        : "관계 면에서는 상대의 태도에 큰 변화가 없었어요. 해치지도, 눈에 띄게 가까워지지도 않은 흐름이었습니다.";
    var reqGloss = (D.requiresGloss && D.requiresGloss[reqTerm]) || "";
    var requiresBox =
      '<div class="synth-req">' +
      '<div class="sr-title">이번 상황이 요구한 대응 · <b>‘' + esc(reqTerm) + '’</b></div>' +
      "<p>" + esc(reqGloss) + " — 이 점을 얼마나 살렸는지가 이번 실습의 핵심이었어요.</p>" +
      proseParas(esc(taskSynth) + " " + esc(relSynth)) +
      "</div>";
    var synthBlock =
      '<div class="fb-block"><div class="fb-h">실습 결과 종합 해석</div>' +
      requiresBox +
      '<div class="fb-block good"><div class="fb-h">잘한 점</div>' + proseParas(goodProse) + "</div>" +
      '<div class="fb-block warn"><div class="fb-h">아쉬운 점</div>' + proseParas(worstProse) + altLine + "</div>" +
      "</div>";

    // ── 이번 교육 주요 학습 포인트! (동기부여) ──
    var learnType = D.types[state.current.target];
    var learnParas = [
      "<b>" + esc(learnType.label) + "</b> 대응은 진단에서 아직 덜 꺼내 쓰던 카드예요. 이번 교육에서는 이걸 <b>의식적으로 한 번 더 시도</b>해보는 걸 목표로 삼아보세요.",
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

      '<div class="fb-hero">' +
      '<div class="hero-kicker">핵심 요약</div>' +
      proseParas(heroLine, "fb-hero-line") +
      '<div class="fb-hero-stats">' + heroStats + "</div>" +
      "</div>" +

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
      '</b><p>현재 점수와 미실습 유형을 기준으로 자동 선정됩니다.</p></div>' +
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
    var vsRows = [];
    state.history.forEach(function (h, hi) {
      h.path.forEach(function (p, pi) {
        var reco = p.feedback && p.feedback.recommendedMode;
        var right = reco
          ? (reco === p.mode
            ? '<span class="vs-match">권장과 일치</span>'
            : '<span class="vs-arrow">권장</span><span class="mode-chip mode-' + reco + '">' + D.types[reco].label + "</span>")
          : "";
        vsRows.push(
          '<li class="vs-item fitline-' + p.fit + '">' +
          '<span class="vs-loc">실습' + (hi + 1) + "·결정" + (pi + 1) + "</span>" +
          '<span class="mode-chip mode-' + p.mode + '">' + D.types[p.mode].label + "</span>" +
          right +
          '<span class="vs-fit vsf-' + p.fit + '">' + fitLabel(p.fit) + "</span></li>"
        );
      });
    });
    var highLabels = state.highest.map(function (k) { return D.types[k].label; }).join(" · ");

    var strengthRows = s.strengthEvidence.map(function (t, i) {
      return '<li><span class="sn">' + (i + 1) + "</span><span>" + emphasizeLead(t) + "</span></li>";
    }).join("");
    var cautionRows = s.cautionEvidence.map(function (t, i) {
      return '<li><span class="sn">' + (i + 1) + "</span><span>" + emphasizeLead(t) + "</span></li>";
    }).join("");
    var outcomeRows = s.outcomePoints.map(function (t) {
      return "<li>" + emphasizeLead(t) + "</li>";
    }).join("");

    // 학습 곡선 (I): 회차별 적합도 세그먼트 바 + 추이
    function curveSegs(kind, count) {
      var out = "";
      for (var i = 0; i < count; i++) out += '<span class="seg seg-' + kind + '"></span>';
      return out;
    }
    var curveRows = s.learningCurve.map(function (c) {
      var scoreTxt = (c.score > 0 ? "+" : "") + c.score;
      var deltaSym = c.stateDelta > 0 ? "심리 ↑" : c.stateDelta < 0 ? "심리 ↓" : "심리 →";
      return '<div class="curve-row">' +
        '<div class="curve-main">' +
        '<span class="curve-n">실습 ' + c.n + "</span>" +
        '<span class="curve-meta">' + esc(c.targetLabel) + "·" + esc(c.opponentLabel) + "</span>" +
        '<span class="curve-seg">' +
        curveSegs("good", c.counts.good) + curveSegs("ok", c.counts.ok) + curveSegs("poor", c.counts.poor) +
        "</span>" +
        '<span class="curve-score">적합도 ' + scoreTxt + "</span>" +
        '<span class="curve-delta">' + deltaSym + "</span>" +
        '<span class="curve-end tone-' + c.endingTone + '">' + esc(c.endingLabel) + "</span>" +
        "</div>" +
        '<div class="curve-path"><span class="cp-label">선택 경로</span>' + esc(c.modePath) + "</div>" +
        "</div>";
    }).join("");
    var curveBlock =
      '<div class="fb-block"><div class="fb-h">회차별 추이 — 적합도 · 선택 경로 · 결말</div>' +
      '<div class="curve">' + curveRows + "</div>" +
      proseParas(esc(s.curveTrend), "curve-trend") +
      '<p class="micro curve-note">※ 회차마다 난이도가 달라 점수보다 흐름 참고용 · 적합도 = 잘맞음 +1 · 무난 0 · 아쉬움 −1</p>' +
      "</div>";

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

      '<div class="fb-block"><div class="fb-h">진단 성향 vs 실전 선택</div>' +
      '<div class="vs-head"><span class="vs-side"><span class="vs-side-l">진단상 높은 유형</span><b>' +
      esc(highLabels) + '</b></span><span class="vs-divider">vs</span>' +
      '<span class="vs-side"><span class="vs-side-l">실전 최다 선택</span><b>' + esc(s.pattern) + "</b></span></div>" +
      proseParas(esc(s.patternPoints[2] || "")) + proseParas(esc(s.patternPoints[3] || "")) + "</div>" +

      '<details class="more vs-more"><summary>결정별 선택 vs 권장 — 펼쳐 보기</summary>' +
      '<ul class="vs-list vs-list-more">' + vsRows.join("") + "</ul></details>" +

      curveBlock +

      '<div class="fb-block"><div class="fb-h">상대 심리 변화와 결말</div><ul class="summary-points">' + outcomeRows + "</ul></div>" +
      '<div class="fb-block good"><div class="fb-h">근거로 확인된 강점</div><ul class="strat">' + strengthRows + "</ul></div>" +
      '<div class="fb-block grow"><div class="fb-h">성장 지점 — 다음에 넓힐 선택</div><ul class="strat">' + cautionRows + "</ul></div>" +
      '<div class="coach-msg"><span class="coach-tag">COACH</span>' +
      '<div class="coach-body">' +
      s.coaching.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
      "</div></div>" +

      '<button class="btn primary big" data-action="restart">' + esc(C.summary.restart) + "</button>" +
      '<p class="micro center">이 리포트는 화면에만 표시되며 저장·전송되지 않습니다. 필요하면 캡처해 활용하세요.</p>' +
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
      var sliders = root.querySelectorAll(".slider");
      sliders.forEach(function (sl) {
        sl.addEventListener("input", function () {
          var k = sl.getAttribute("data-type");
          state.form[k] = parseInt(sl.value, 10);
          sl.style.setProperty("--pct", Math.round((state.form[k] / 12) * 100) + "%");
          var out = root.querySelector('[data-out="' + k + '"]');
          if (out) out.textContent = sl.value;
          updateTotal();
        });
      });
      updateTotal();
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

  function updateTotal() {
    var total = D.order.reduce(function (a, k) { return a + state.form[k]; }, 0);
    var el = root.querySelector("[data-total]");
    var hint = root.querySelector("[data-hint]");
    if (el) el.innerHTML = "합계 <b>" + total + "</b> / 30";
    var meter = root.querySelector("[data-meter]");
    if (meter) {
      meter.style.width = Math.min(100, (total / 60) * 100) + "%";
      meter.classList.toggle("off", Math.abs(total - 30) > 5);
    }
    if (hint) {
      if (Math.abs(total - 30) > 5) {
        hint.textContent = "합계가 30에서 꽤 벗어나요. 그대로 진행해도 상대적 경향으로 해석합니다.";
        hint.className = "hint warn";
      } else {
        hint.textContent = "";
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
      var next = Math.max(0, Math.min(12, state.form[typeKey] + delta));
      state.form[typeKey] = next;
      var slider = root.querySelector("#score-" + typeKey);
      if (slider) {
        slider.value = next;
        slider.style.setProperty("--pct", Math.round((next / 12) * 100) + "%");
      }
      var out = root.querySelector('[data-out="' + typeKey + '"]');
      if (out) out.textContent = next;
      updateTotal();
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
    // 범위는 슬라이더가 보장(0~12). 합계는 경고만.
    D.order.forEach(function (k) {
      var v = state.form[k];
      state.form[k] = Math.max(0, Math.min(12, isNaN(v) ? 0 : v));
    });
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
    state.form = { competing: 6, collaborating: 6, compromising: 6, avoiding: 6, accommodating: 6 };
    __sent = false; __sid = null;
    render();
  }

  /* ── 결과 자동 전송 (교수자 대시보드 연동) ── */
  var TKI_ENDPOINT = "https://script.google.com/macros/s/AKfycbzGWcr-3Y_KhBngewiE5POu6iGd8dlVMPD1b0S0MwSx8UjKcS9W2U7IugfBTbBLYyt2vQ/exec";
  var __sent = false, __sid = null;
  function tkiSend() {
    if (!TKI_ENDPOINT || __sent || !state.history.length) return;
    __sent = true;
    __sid = __sid || ("s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    var payload = {
      id: __sid, submittedAt: new Date().toISOString(),
      profile: state.profile, scores: state.scores,
      practices: state.history.map(function (h) {
        return {
          scenarioKey: h.scenarioKey, target: h.target, opponentType: h.opponentType,
          requires: h.requires, startState: h.startState, endingKey: h.endingKey,
          decisions: h.path.map(function (p) { return { stage: p.stage, mode: p.mode, fit: p.fit }; })
        };
      })
    };
    try {
      fetch(TKI_ENDPOINT, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  /* ============================ 시작 ============================ */
  render();
})();
