(function () {
  function stripCommentsAndStrings(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  }

  function detectRecursion(cleanCode, lang) {
    const patterns = lang === 'python'
      ? [/def\s+([a-zA-Z0-9_]+)\s*\(/]
      : [/function\s+([a-zA-Z0-9_$]+)\s*\(/, /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/];

    for (const pattern of patterns) {
      const match = cleanCode.match(pattern);
      if (match) {
        const fn = match[1];
        const body = cleanCode.substring(match.index + match[0].length);
        const re = new RegExp(`\\b${fn}\\b\\s*\\(`, 'g');
        if (re.test(body)) return true;
      }
    }
    return false;
  }

  function detectLogPattern(cleanCode, lang) {
    const logPatterns = lang === 'python'
      ? [/\w+\s*=\s*\w+\s*\/\s*2/, /\w+\s*\/=\s*2/, /\w+\s*//=\s*2/, /binary_search/i]
      : [/\w+\s*\/=\s*2/, /\w+\s*=\s*\w+\s*\/\s*2/, /\w+\s*>>=\s*1/, /Math\.floor\(/, /binarySearch/i];

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

    // Fallback for Python indentation (very rough): count nested 'for'/'while'
    if (lang === 'python' && maxNesting === 0) {
      const nested = cleanCode.match(/for\s+.*:\s*[\s\S]*for\s+.*:/m);
      if (nested) maxNesting = 2;
      else if (cleanCode.match(/\b(for|while)\b/)) maxNesting = 1;
    }

    return maxNesting;
  }

  function analyze(code, lang = 'javascript') {
    if (!code || typeof code !== 'string') return 'O(1)';
    const clean = stripCommentsAndStrings(code);
    const hasRecursion = detectRecursion(clean, lang);
    const hasLog = detectLogPattern(clean, lang);
    const nesting = maxLoopNesting(clean, lang);

    if (hasRecursion) return 'O(2^n) (recursive)';
    if (nesting === 0) return hasLog ? 'O(log n)' : 'O(1)';
    if (nesting === 1) return hasLog ? 'O(log n)' : 'O(n)';
    if (nesting === 2) return hasLog ? 'O(n log n)' : 'O(n^2)';
    return `O(n^${nesting})`;
  }

  window.ComplexityAnalyzer = { analyze };
})();
