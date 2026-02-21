(function () {

  // ─── Strip comments and string literals ──────────────────────────────────
  function stripCommentsAndStrings(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/#.*$/gm, '')
      .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  }

  // ─── Extract body between first matching { } ──────────────────────────────
  function extractBraceBody(str) {
    let depth = 0, start = -1;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '{') {
        if (start === -1) start = i + 1;
        depth++;
      } else if (str[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) return str.slice(start, i);
      }
    }
    return str;
  }

  // ─── Recursion detection ──────────────────────────────────────────────────
  // Returns: 'none' | 'linear' | 'exponential'
  function detectRecursionKind(cleanCode, lang) {
    const innerMatches = lang === 'python'
      ? [...cleanCode.matchAll(/\bdef\s+(dfs|helper|backtrack|recurse|traverse|bfs|explore|solve)\s*\(/gi)]
      : [...cleanCode.matchAll(/\bfunction\s+(dfs|helper|backtrack|recurse|traverse|bfs|explore|solve)\s*\(/gi)];

    for (const m of innerMatches) {
      const name = m[1].toLowerCase();
      const afterDef = cleanCode.slice(m.index + m[0].length);
      const helperBody = lang === 'python' ? afterDef : extractBraceBody(afterDef);

      // Grid DFS: calls with arithmetic on coordinates like dfs(r+1,c), dfs(r,c-1)
      const gridDfsRe = new RegExp(`\\b${name}\\s*\\([^)]*[+\\-]\\s*\\d*[^)]*,[^)]*\\)`, 'gi');
      const gridCalls = (helperBody.match(gridDfsRe) || []).length;
      if (gridCalls >= 2) return 'linear';

      // Count recursive calls inside helper body
      const callRe = new RegExp(`\\b${name}\\b\\s*\\(`, 'g');
      const callsInBody = (helperBody.match(callRe) || []).length;
      if (callsInBody === 0) continue;

      // Backtracking: if the function is named 'backtrack' → always exponential
      // (explores all subsets/permutations, 2^n paths)
      if (name === 'backtrack' || name === 'solve') return 'exponential';

      // Multiple recursive calls (binary tree style) → exponential
      if (callsInBody >= 2) return 'exponential';

      // One recursive call in a for loop over children = tree DFS = linear
      return 'linear';
    }

    // Outer function self-recursion
    const outerRe = lang === 'python'
      ? /^def\s+([a-zA-Z0-9_]+)\s*\(/m
      : /^function\s+([a-zA-Z0-9_$]+)\s*\(/m;

    const outerM = cleanCode.match(outerRe);
    if (outerM) {
      const fn = outerM[1];
      const body = lang === 'python'
        ? cleanCode.slice(outerM.index + outerM[0].length)
        : extractBraceBody(cleanCode.slice(outerM.index + outerM[0].length));
      const selfCalls = (body.match(new RegExp(`\\b${fn}\\b\\s*\\(`, 'g')) || []).length;
      if (selfCalls >= 2) return 'exponential';
      if (selfCalls >= 1) return 'linear';
    }

    return 'none';
  }

  // ─── Binary search detection ─────────────────────────────────────────────
  function isBinarySearch(cleanCode) {
    const hasLeftRight = /\bleft\b/.test(cleanCode) && /\bright\b/.test(cleanCode);
    const hasMid = /\bmid\b/.test(cleanCode);
    const hasHalving = /Math\.floor\s*\([^)]*\/\s*2\s*\)/.test(cleanCode) ||
                       />>[\s]*1\b/.test(cleanCode) ||
                       /\/\/\s*2\b/.test(cleanCode);
    const hasExplicit = /binary.?search/i.test(cleanCode);
    return hasExplicit || (hasLeftRight && hasMid) || (hasLeftRight && hasHalving);
  }

  // ─── Detect amortized O(n) patterns ──────────────────────────────────────
  function isAmortizedLinear(cleanCode) {
    // Sliding window: left++ inside while, with right pointer
    const hasSlidingWindow =
      /\bleft\b/.test(cleanCode) && /\bright\b/.test(cleanCode) &&
      /while\s*\(/.test(cleanCode) &&
      (/\bleft\b\s*\+\+|\+\+\s*\bleft\b|left\s*\+=/.test(cleanCode));

    // Monotonic stack: stack.pop() inside while(stack...)
    const hasMonotonicStack =
      /\bstack\b/.test(cleanCode) &&
      /\.pop\(\)/.test(cleanCode) &&
      /while\s*\(\s*stack/.test(cleanCode);

    // Python: stack.pop() inside while stack
    const hasPyMonotonicStack =
      /\bstack\b/.test(cleanCode) &&
      /stack\.pop\(\)/.test(cleanCode) &&
      /while\s+stack/.test(cleanCode);

    return hasSlidingWindow || hasMonotonicStack || hasPyMonotonicStack;
  }

  // ─── Max NESTED loop depth ────────────────────────────────────────────────
  // Correctly handles both brace-delimited and braceless loops.
  // A braceless loop like `for(i) for(j) stmt` has nesting depth 2.
  // Two sequential loops `for(i){...} for(j){...}` have nesting depth 1.
  function maxNestedLoopDepth(cleanCode, lang) {
    if (lang === 'python') {
      const lines = cleanCode.split('\n');
      let maxDepth = 0;
      const loopIndentStack = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const indent = line.length - line.trimStart().length;
        const trimmed = line.trimStart();
        const isLoop = /^(for|while)\s/.test(trimmed);

        while (loopIndentStack.length &&
               loopIndentStack[loopIndentStack.length - 1] >= indent) {
          loopIndentStack.pop();
        }
        if (isLoop) {
          loopIndentStack.push(indent);
          if (loopIndentStack.length > maxDepth) maxDepth = loopIndentStack.length;
        }
      }
      return maxDepth;
    }

    // JavaScript: character-by-character with explicit braceless loop tracking.
    //
    // State machine:
    //   braceDepth: current {} nesting
    //   parenDepth: current () nesting
    //   awaitingBody: count of loop headers that closed ')' and are waiting for their body
    //                 (either '{' or a braceless statement)
    //   bracelessDepth: additional nesting depth from braceless loops
    //
    // When a loop header `for(...)` / `while(...)` closes its `)` at parenDepth=0:
    //   - If next non-space char is `{`: normal braced body, push braceDepth+1 to activeLoops
    //   - If next non-space char is NOT `{`: braceless body, increment bracelessDepth
    //     The braceless loop ends after the next complete statement (`;` at parenDepth=0, braceDepth=same)
    //
    // Active braced loops: stored as the braceDepth at which their body lives
    // Active braceless loops: counted by bracelessDepth (they live until a `;` or `}`)

    let braceDepth = 0;
    let parenDepth = 0;
    let maxNesting = 0;
    const bracedLoopDepths = []; // braceDepth of each active braced loop's body
    let bracelessCount = 0;      // number of currently active braceless loops

    // After a loop header closes, we need to know what comes next
    let pendingBracelessCheck = false; // we saw `for(...)` close, check next char

    const len = cleanCode.length;
    let i = 0;

    // Helper: current total loop nesting
    function currentNesting() {
      return bracedLoopDepths.length + bracelessCount;
    }

    while (i < len) {
      const ch = cleanCode[i];

      if (pendingBracelessCheck && !/\s/.test(ch)) {
        // We just saw a loop header close; ch is the first non-space char of body
        pendingBracelessCheck = false;
        if (ch === '{') {
          // Braced body — will be handled by the '{' branch below
          // Don't advance i; fall through to '{' handler
          braceDepth++;
          bracedLoopDepths.push(braceDepth);
          const n = currentNesting();
          if (n > maxNesting) maxNesting = n;
          i++;
          continue;
        } else {
          // Braceless body — this loop wraps the next statement
          bracelessCount++;
          const n = currentNesting();
          if (n > maxNesting) maxNesting = n;
          // Don't advance — process this char normally below
        }
      } else if (pendingBracelessCheck) {
        // Still whitespace — skip
        i++;
        continue;
      }

      if (ch === '{') {
        braceDepth++;
        // Don't push to bracedLoopDepths here — pendingBracelessCheck handled above
        i++;
      } else if (ch === '}') {
        // Pop braced loops whose body just closed
        while (bracedLoopDepths.length &&
               bracedLoopDepths[bracedLoopDepths.length - 1] >= braceDepth) {
          bracedLoopDepths.pop();
        }
        braceDepth = Math.max(0, braceDepth - 1);
        // Closing brace also ends braceless loops at this scope
        // (braceless loops that were entered at same braceDepth)
        // Heuristic: each '}' that closes a block also ends any braceless loops
        // inside that block. Reset bracelessCount conservatively.
        // Actually braceless loops end at the first ';' — handled below.
        i++;
      } else if (ch === '(') {
        parenDepth++;
        i++;
      } else if (ch === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        if (parenDepth === 0 && pendingBracelessCheck === false) {
          // This might close a loop header — check if we were tracking one
          // We set pendingBracelessCheck when we find a loop keyword
          // But we need to track whether this ) closes a loop's (...)
          // This is handled by the loopHeaderParenDepth tracking below
        }
        i++;
      } else if (ch === ';' && parenDepth === 0) {
        // Semicolon at top paren level ends braceless loop bodies
        // Pop ALL braceless loops (a ';' ends all pending braceless statements)
        bracelessCount = 0;
        i++;
      } else {
        // Check for loop keyword
        const sub = cleanCode.slice(i);
        const lm = sub.match(/^(for|while)\s*\(|^\.forEach\s*\(|^\.map\s*\(|^\.filter\s*\(/);
        if (lm && parenDepth === 0) {
          // Found a loop. Its header is the (...) that follows.
          // Skip past the loop keyword to find the opening '('
          const keyword = lm[0];
          // Find the matching ')' for this loop's header
          let j = i + keyword.length - 1; // position of '(' in keyword match
          // Actually keyword ends with '(' — so j is at '('
          // Count matching parens
          let pd = 1;
          j++; // move past '('
          while (j < len && pd > 0) {
            if (cleanCode[j] === '(') pd++;
            else if (cleanCode[j] === ')') pd--;
            j++;
          }
          // j is now just past the closing ')' of the loop header
          // Skip whitespace to see what follows
          let k = j;
          while (k < len && /\s/.test(cleanCode[k])) k++;

          if (k < len && cleanCode[k] === '{') {
            // Braced body
            braceDepth++;
            bracedLoopDepths.push(braceDepth);
            const n = currentNesting();
            if (n > maxNesting) maxNesting = n;
            i = k + 1; // skip past '{'
          } else {
            // Braceless body — the next statement is this loop's body
            bracelessCount++;
            const n = currentNesting();
            if (n > maxNesting) maxNesting = n;
            i = k; // position at first char of body (could be another for/while)
          }
          continue;
        } else {
          i++;
        }
      }
    }

    return maxNesting;
  }

  // ─── Space complexity ─────────────────────────────────────────────────────
  function analyzeSpace(cleanCode, lang, recursionKind) {
    if (recursionKind === 'exponential') return 'O(2^n)';
    if (recursionKind === 'linear') return 'O(n)';

    const hasMap = lang === 'python'
      ? /\bfreq\b\s*=\s*\{|\bmap\b\s*=\s*\{|\bcount\b\s*=\s*\{|\bseen\b\s*=\s*\{|\bvisited\b\s*=\s*\{|\bcache\b\s*=\s*\{|\bprefix\b\s*=\s*\[|\bd\b\s*=\s*\{|\bdp\b\s*=\s*\{/.test(cleanCode)
      : /\bfreq\b\s*=\s*\{|\bmap\b\s*=\s*\{|\bcount\b\s*=\s*\{|\bseen\b\s*=\s*\{|\bvisited\b\s*=\s*\{|\bcache\b\s*=\s*\{|\bnew Map\s*\(|\bdp\b\s*=\s*\[|\bnew Array\b/.test(cleanCode);

    const hasArray = lang === 'python'
      ? /\bout\b\s*=\s*\[|\bres\b\s*=\s*\[|\bresult\b\s*=\s*\[|\bstack\b\s*=\s*\[|\bqueue\b\s*=\s*\[|\bpath\b\s*=\s*\[/.test(cleanCode)
      : /\bout\b\s*=\s*\[|\bres\b\s*=\s*\[|\bstack\b\s*=\s*\[|\bqueue\b\s*=\s*\[|\bpath\b\s*=\s*\[|\bnew Array\b/.test(cleanCode);

    if (hasMap || hasArray) return 'O(n)';
    return 'O(1)';
  }

  // ─── Main analysis ────────────────────────────────────────────────────────
  function analyze(code, lang) {
    lang = lang || 'javascript';
    if (!code || typeof code !== 'string' || code.trim().length < 5) {
      return { time: 'O(1)', space: 'O(1)' };
    }

    const clean = stripCommentsAndStrings(code);
    const recursionKind = detectRecursionKind(clean, lang);
    const bs = isBinarySearch(clean);
    const amortized = isAmortizedLinear(clean);
    const nesting = maxNestedLoopDepth(clean, lang);
    const space = analyzeSpace(clean, lang, recursionKind);

    let time;

    if (recursionKind === 'exponential') {
      time = 'O(2^n)';
    } else if (recursionKind === 'linear') {
      time = 'O(n)';
    } else if (bs) {
      time = nesting >= 2 ? 'O(n log n)' : 'O(log n)';
    } else if (amortized) {
      time = 'O(n)';
    } else if (nesting === 0) {
      time = 'O(1)';
    } else if (nesting === 1) {
      time = 'O(n)';
    } else if (nesting === 2) {
      time = 'O(n\u00b2)';
    } else {
      time = 'O(n^' + nesting + ')';
    }

    return { time, space };
  }

  function analyzeFull(code, lang) {
    const result = analyze(code, lang);
    return { time: result.time, space: result.space, summary: 'Time: ' + result.time + '\nSpace: ' + result.space };
  }

  window.ComplexityAnalyzer = { analyze, analyzeFull };

})();
