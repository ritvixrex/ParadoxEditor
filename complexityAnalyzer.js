(function () {
  function stripCommentsAndStrings(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  }

  function detectRecursion(cleanCode, lang) {
    const patterns = lang === 'python'
      ? [/def\s+([a-zA-Z0-9_]+)\s*\(/g]
      : [
          /function\s+([a-zA-Z0-9_$]+)\s*\(/g,
          /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g,
          /([a-zA-Z0-9_$]+)\s*(?:=\s*)?\([^)]*\)\s*\{/g,  // method shorthand
        ];

    for (const pattern of patterns) {
      // Find ALL function names (not just the first)
      const matches = [...cleanCode.matchAll(pattern)];
      for (const match of matches) {
        const fn = match[1];
        if (!fn) continue;
        // Get the body after this function declaration
        const body = cleanCode.substring(match.index + match[0].length);
        const selfCallRe = new RegExp(`\\b${fn}\\b\\s*\\(`, 'g');
        const selfCalls = [...body.matchAll(selfCallRe)];

        if (selfCalls.length >= 2) {
          // Two or more recursive calls → exponential O(2^n)
          return { isRecursive: true, isExponential: true };
        } else if (selfCalls.length === 1) {
          // Single recursive call → linear O(n) stack depth
          return { isRecursive: true, isExponential: false };
        }
      }
    }
    return { isRecursive: false, isExponential: false };
  }

  function detectLogPattern(cleanCode, lang) {
    const logPatterns = lang === 'python'
      ? [
          /\w+\s*=\s*\w+\s*\/\s*2/,    // mid = n / 2
          /\w+\s*\/=\s*2/,              // n /= 2
          /\w+\s*\/\/=\s*2/,            // n //= 2 (Python floor divide — fixed regex)
          /binary_search/i
        ]
      : [
          /\w+\s*\/=\s*2/,              // n /= 2
          /\w+\s*=\s*\w+\s*\/\s*2/,    // mid = n / 2
          /\w+\s*>>=\s*1/,              // n >>= 1
          /Math\.floor\(/,
          /binarySearch/i
        ];

    return logPatterns.some(p => p.test(cleanCode));
  }

  function maxLoopNesting(cleanCode, lang) {
    const loopKeywords = lang === 'python'
      ? ['for ', 'while ']
      : ['for ', 'while ', '.forEach(', '.map(', '.filter(', '.reduce('];

    const tokens = cleanCode.split(/({|})/);
    let currentDepth = 0;
    let activeLoopDepths = [];
    let maxNesting = 0;

    tokens.forEach(token => {
      if (token === '{') {
        currentDepth++;
      } else if (token === '}') {
        activeLoopDepths = activeLoopDepths.filter(d => d < currentDepth);
        currentDepth = Math.max(0, currentDepth - 1);
      } else {
        if (loopKeywords.some(kw => token.includes(kw))) {
          activeLoopDepths.push(currentDepth);
          maxNesting = Math.max(maxNesting, activeLoopDepths.length);
        }
      }
    });

    // Fallback for Python indentation: count nested for/while
    if (lang === 'python' && maxNesting === 0) {
      const nested = cleanCode.match(/for\s+.*:\s*[\s\S]*for\s+.*:/m);
      if (nested) maxNesting = 2;
      else if (cleanCode.match(/\b(for|while)\b/)) maxNesting = 1;
    }

    return maxNesting;
  }

  function analyzeSpace(cleanCode, lang, recursionInfo) {
    let space = 'O(1)';
    if (lang === 'javascript') {
      if (cleanCode.match(/new\s+Array\(/) || cleanCode.match(/\[\s*\.\.\./)) space = 'O(n)';
      if (cleanCode.match(/\.map\(/) || cleanCode.match(/\.filter\(/)) space = 'O(n)';
      if (recursionInfo.isRecursive) space = 'O(n) (stack)';
    } else {
      if (cleanCode.match(/\[.*for.*in.*\]/)) space = 'O(n)';
      if (recursionInfo.isRecursive) space = 'O(n) (stack)';
    }
    return space;
  }

  function analyze(code, lang = 'javascript') {
    if (!code || typeof code !== 'string') return { time: 'O(1)', space: 'O(1)' };
    const clean = stripCommentsAndStrings(code);
    const recursionInfo = detectRecursion(clean, lang);
    const hasLog = detectLogPattern(clean, lang);
    const nesting = maxLoopNesting(clean, lang);
    const space = analyzeSpace(clean, lang, recursionInfo);

    let time;
    if (recursionInfo.isRecursive && recursionInfo.isExponential) {
      time = 'O(2^n)';
    } else if (recursionInfo.isRecursive && !recursionInfo.isExponential) {
      time = 'O(n)';
    } else if (nesting === 0) {
      time = hasLog ? 'O(log n)' : 'O(1)';
    } else if (nesting === 1) {
      time = hasLog ? 'O(n log n)' : 'O(n)';
    } else if (nesting === 2) {
      time = hasLog ? 'O(n^2 log n)' : 'O(n^2)';
    } else {
      time = `O(n^${nesting})`;
    }

    return { time, space };
  }

  function analyzeFull(code, lang = 'javascript') {
    const { time, space } = analyze(code, lang);
    return {
      time,
      space,
      summary: `Time: ${time}\nSpace: ${space}`
    };
  }

  window.ComplexityAnalyzer = { analyze, analyzeFull };
})();
