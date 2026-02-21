(function () {

  window.GOLDEN_THEOREMS = [
    {
      number: 1,
      rule: "Hash map reduces nested loop to O(n) — if you need a count or frequency of elements, reach for a hash map first.",
      example: "Anagram detection, majority element, first unique character."
    },
    {
      number: 2,
      rule: "Sorted array + need a pair/triplet? Use two pointers — O(n) beats O(n²) every time.",
      example: "Two Sum II (sorted), 3Sum, container with most water."
    },
    {
      number: 3,
      rule: "Subarray / substring problem? Think sliding window. Brute-force is O(n²); sliding window is O(n).",
      example: "Max sum subarray of size k, longest substring without repeating chars."
    },
    {
      number: 4,
      rule: "Sorted array + search? Write binary search. Also applies to any monotonic answer space ('find minimum satisfying X').",
      example: "Search in rotated array, find peak element, capacity problems."
    },
    {
      number: 5,
      rule: "Matching pairs or 'next greater element'? Use a stack — it models the most-recent-unmatched element perfectly.",
      example: "Valid parentheses, next greater element, monotonic stack problems."
    },
    {
      number: 6,
      rule: "Linked list cycle, middle node, or palindrome check in O(1) space? Fast & slow pointers (Floyd's algorithm).",
      example: "Detect cycle, find middle, linked list palindrome."
    },
    {
      number: 7,
      rule: "Generate ALL valid configurations (permutations, subsets, combos)? Backtracking: choose → explore → unchoose.",
      example: "Permutations, subsets, combination sum, N-Queens."
    },
    {
      number: 8,
      rule: "K largest / smallest elements or streaming minimum? Use a heap of size k — O(n log k) beats sorting O(n log n).",
      example: "Kth largest, top K frequent, merge K sorted lists, median stream."
    },
    {
      number: 9,
      rule: "Interval problems and activity selection? Sort first, then greedily pick. Always prove your greedy choice is safe.",
      example: "Jump game, merge intervals, activity selection, meeting rooms."
    },
    {
      number: 10,
      rule: "Overlapping subproblems + optimal substructure? Dynamic programming. Start with the recurrence, then memoize or tabulate.",
      example: "Fibonacci, climbing stairs, coin change, longest common subsequence."
    }
  ];

  window.DSA_PATTERNS = [

    // ── 1: Frequency Map ──────────────────────────────────────────────────────
    {
      id: 'freq_map',
      name: 'Frequency Map',
      category: 'Hashing',
      emoji: '🗺️',
      motivation: 'Master this pattern and you instantly solve 20% of LeetCode Easy/Medium problems. Every experienced interviewer expects it.',
      whenToUse: [
        'Problem asks "how many times does X appear?"',
        'You need to find duplicates, anagrams, or majority elements.',
        'You need to compare element counts between two collections.',
        'You need the first/last occurrence of a condition based on count.'
      ],
      keyInsight: 'A hash map turns O(n) count lookups into O(1). Build the frequency map in one pass, answer all questions in a second pass.',
      goldenRule: 1,
      problems: [
        {
          title: 'isAnagram — Valid Anagram',
          description: 'Given two strings s and t, return true if t is an anagram of s (same characters, same frequencies).',
          code: {
            javascript: `function isAnagram(s, t) {
  if (s.length !== t.length) return false;
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  for (const ch of t) {
    if (!freq[ch]) return false;
    freq[ch]--;
  }
  return true;
}

console.log(isAnagram("anagram", "nagaram")); // true
console.log(isAnagram("rat", "car"));          // false`,
            python: `def isAnagram(s: str, t: str) -> bool:
    if len(s) != len(t):
        return False
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    for ch in t:
        if not freq.get(ch):
            return False
        freq[ch] -= 1
    return True

print(isAnagram("anagram", "nagaram"))  # True
print(isAnagram("rat", "car"))           # False`
          }
        },
        {
          title: 'firstUniqChar — First Unique Character',
          description: 'Find the index of the first non-repeating character in a string. Return -1 if none exists.',
          code: {
            javascript: `function firstUniqChar(s) {
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  for (let i = 0; i < s.length; i++) {
    if (freq[s[i]] === 1) return i;
  }
  return -1;
}

console.log(firstUniqChar("leetcode")); // 0  ('l')
console.log(firstUniqChar("loveleet")); // 2  ('v')
console.log(firstUniqChar("aabb"));     // -1`,
            python: `def firstUniqChar(s: str) -> int:
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    for i, ch in enumerate(s):
        if freq[ch] == 1:
            return i
    return -1

print(firstUniqChar("leetcode"))  # 0
print(firstUniqChar("loveleet"))  # 2`
          }
        },
        {
          title: 'majorityElement — Majority Element',
          description: 'Find the element appearing more than n/2 times. Guaranteed to exist.',
          code: {
            javascript: `function majorityElement(nums) {
  const freq = {};
  const half = nums.length / 2;
  for (const n of nums) {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > half) return n;
  }
}

console.log(majorityElement([3, 2, 3]));           // 3
console.log(majorityElement([2, 2, 1, 1, 1, 2, 2])); // 2`,
            python: `def majorityElement(nums) -> int:
    freq = {}
    half = len(nums) / 2
    for n in nums:
        freq[n] = freq.get(n, 0) + 1
        if freq[n] > half:
            return n

print(majorityElement([3, 2, 3]))           # 3
print(majorityElement([2, 2, 1, 1, 1, 2, 2]))  # 2`
          }
        }
      ]
    },

    // ── 2: Two Pointers ───────────────────────────────────────────────────────
    {
      id: 'two_pointers',
      name: 'Two Pointers',
      category: 'Arrays',
      emoji: '👉👈',
      motivation: 'Two pointers converts O(n²) brute-force pair searches into elegant O(n) solutions. Interviewers love it.',
      whenToUse: [
        'Array is sorted and you need pairs/triplets summing to a target.',
        'You need to remove duplicates or partition in-place.',
        'You are checking for palindromes.',
        'The problem implies "converging from both ends".'
      ],
      keyInsight: 'Start one pointer at each end. Move the smaller-value pointer inward when sum is too small, the larger when too big. No extra space needed.',
      goldenRule: 2,
      problems: [
        {
          title: 'removeDuplicates — Remove Duplicates In-Place',
          description: 'Given a sorted array, remove duplicates in-place and return the new length. Slow/fast pointer pattern.',
          code: {
            javascript: `function removeDuplicates(nums) {
  if (!nums.length) return 0;
  let slow = 0;
  for (let fast = 1; fast < nums.length; fast++) {
    if (nums[fast] !== nums[slow]) {
      slow++;
      nums[slow] = nums[fast];
    }
  }
  return slow + 1;
}

const arr = [1, 1, 2, 3, 3, 4];
const len = removeDuplicates(arr);
console.log(len, arr.slice(0, len)); // 4 [1,2,3,4]`,
            python: `def removeDuplicates(nums) -> int:
    if not nums:
        return 0
    slow = 0
    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1

arr = [1, 1, 2, 3, 3, 4]
print(removeDuplicates(arr))  # 4`
          }
        },
        {
          title: 'twoSumSorted — Two Sum (Sorted Array)',
          description: 'Given a 1-indexed sorted array, return indices [i, j] where numbers[i] + numbers[j] = target.',
          code: {
            javascript: `function twoSumSorted(numbers, target) {
  let left = 0, right = numbers.length - 1;
  while (left < right) {
    const sum = numbers[left] + numbers[right];
    if (sum === target) return [left + 1, right + 1];
    else if (sum < target) left++;
    else right--;
  }
  return [];
}

console.log(twoSumSorted([2, 7, 11, 15], 9)); // [1, 2]
console.log(twoSumSorted([2, 3, 4], 6));        // [1, 3]`,
            python: `def twoSumSorted(numbers, target: int):
    left, right = 0, len(numbers) - 1
    while left < right:
        s = numbers[left] + numbers[right]
        if s == target:
            return [left + 1, right + 1]
        elif s < target:
            left += 1
        else:
            right -= 1
    return []

print(twoSumSorted([2, 7, 11, 15], 9))  # [1, 2]`
          }
        },
        {
          title: 'isPalindrome — Palindrome Check',
          description: 'Check if a string is a palindrome, ignoring case and non-alphanumeric characters.',
          code: {
            javascript: `function isPalindrome(s) {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let left = 0, right = clean.length - 1;
  while (left < right) {
    if (clean[left] !== clean[right]) return false;
    left++;
    right--;
  }
  return true;
}

console.log(isPalindrome("A man, a plan, a canal: Panama")); // true
console.log(isPalindrome("race a car"));                      // false`,
            python: `def isPalindrome(s: str) -> bool:
    clean = ''.join(c.lower() for c in s if c.isalnum())
    left, right = 0, len(clean) - 1
    while left < right:
        if clean[left] != clean[right]:
            return False
        left += 1
        right -= 1
    return True

print(isPalindrome("A man, a plan, a canal: Panama"))  # True`
          }
        }
      ]
    },

    // ── 3: Sliding Window ─────────────────────────────────────────────────────
    {
      id: 'sliding_window',
      name: 'Sliding Window',
      category: 'Arrays',
      emoji: '🪟',
      motivation: 'Every "max/min over a contiguous subarray" problem is a sliding window in disguise. Nail this and 15+ problems fall.',
      whenToUse: [
        'Problem mentions a fixed-size window (k elements).',
        'You need max/min/sum over every window of a given size.',
        'You need the shortest subarray satisfying a sum condition.',
        'Brute-force would be O(n²) because of an inner loop you can eliminate.'
      ],
      keyInsight: 'Maintain a running aggregate. Slide by adding the incoming element and subtracting the outgoing one — the inner loop becomes a single O(1) operation.',
      goldenRule: 3,
      problems: [
        {
          title: 'maxSumSubarray — Max Sum Subarray of Size K',
          description: 'Find the maximum sum of any contiguous subarray of size k. Fixed window size.',
          code: {
            javascript: `function maxSumSubarray(nums, k) {
  let windowSum = 0;
  for (let i = 0; i < k; i++) windowSum += nums[i];
  let maxSum = windowSum;
  for (let i = k; i < nums.length; i++) {
    windowSum += nums[i] - nums[i - k]; // slide
    maxSum = Math.max(maxSum, windowSum);
  }
  return maxSum;
}

console.log(maxSumSubarray([2, 1, 5, 1, 3, 2], 3)); // 9  (5+1+3)
console.log(maxSumSubarray([2, 3, 4, 1, 5], 2));      // 7  (3+4)`,
            python: `def maxSumSubarray(nums, k: int) -> int:
    window_sum = sum(nums[:k])
    max_sum = window_sum
    for i in range(k, len(nums)):
        window_sum += nums[i] - nums[i - k]
        max_sum = max(max_sum, window_sum)
    return max_sum

print(maxSumSubarray([2, 1, 5, 1, 3, 2], 3))  # 9`
          }
        },
        {
          title: 'minSubArrayLen — Minimum Length Subarray with Sum ≥ S',
          description: 'Return the minimum length of a contiguous subarray whose sum >= target. Variable window size.',
          code: {
            javascript: `function minSubArrayLen(target, nums) {
  let left = 0, sum = 0, minLen = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];
    while (sum >= target) {           // shrink from left
      minLen = Math.min(minLen, right - left + 1);
      sum -= nums[left++];
    }
  }
  return minLen === Infinity ? 0 : minLen;
}

console.log(minSubArrayLen(7, [2, 3, 1, 2, 4, 3])); // 2  (4+3)
console.log(minSubArrayLen(4, [1, 4, 4]));             // 1`,
            python: `def minSubArrayLen(target: int, nums) -> int:
    left = total = 0
    min_len = float('inf')
    for right in range(len(nums)):
        total += nums[right]
        while total >= target:
            min_len = min(min_len, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if min_len == float('inf') else min_len

print(minSubArrayLen(7, [2, 3, 1, 2, 4, 3]))  # 2`
          }
        }
      ]
    },

    // ── 4: Hash + Sliding Window ──────────────────────────────────────────────
    {
      id: 'hash_sliding_window',
      name: 'Hash + Sliding Window',
      category: 'Strings',
      emoji: '🔑',
      motivation: 'Unlocks the entire class of "longest substring with constraint" problems — critical for string-heavy interviews.',
      whenToUse: [
        'Longest/shortest substring with a character-count constraint.',
        'Window must have at most/exactly k distinct characters.',
        'Anagram or permutation detection within a longer string.',
        'Variable-width window where you need fast membership/count queries.'
      ],
      keyInsight: 'Use a hash map to track character counts inside the window. Expand right freely; shrink from the left whenever the constraint is violated.',
      goldenRule: 3,
      problems: [
        {
          title: 'lengthOfLongestSubstring — No Repeating Characters',
          description: 'Find the length of the longest substring without repeating characters.',
          code: {
            javascript: `function lengthOfLongestSubstring(s) {
  const seen = new Map(); // char -> last index seen
  let left = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    if (seen.has(s[right]) && seen.get(s[right]) >= left) {
      left = seen.get(s[right]) + 1; // jump past the duplicate
    }
    seen.set(s[right], right);
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}

console.log(lengthOfLongestSubstring("abcabcbb")); // 3
console.log(lengthOfLongestSubstring("pwwkew"));   // 3
console.log(lengthOfLongestSubstring("bbbbb"));    // 1`,
            python: `def lengthOfLongestSubstring(s: str) -> int:
    seen = {}  # char -> last index
    left = max_len = 0
    for right, ch in enumerate(s):
        if ch in seen and seen[ch] >= left:
            left = seen[ch] + 1
        seen[ch] = right
        max_len = max(max_len, right - left + 1)
    return max_len

print(lengthOfLongestSubstring("abcabcbb"))  # 3`
          }
        },
        {
          title: 'longestKDistinct — At Most K Distinct Characters',
          description: 'Find the length of the longest substring with at most k distinct characters.',
          code: {
            javascript: `function longestKDistinct(s, k) {
  const freq = new Map();
  let left = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    freq.set(s[right], (freq.get(s[right]) || 0) + 1);
    while (freq.size > k) {           // too many distinct — shrink
      const lCh = s[left++];
      freq.set(lCh, freq.get(lCh) - 1);
      if (freq.get(lCh) === 0) freq.delete(lCh);
    }
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}

console.log(longestKDistinct("araaci", 2)); // 4  ("araa")
console.log(longestKDistinct("cbbebi", 3)); // 5`,
            python: `from collections import defaultdict

def longestKDistinct(s: str, k: int) -> int:
    freq = defaultdict(int)
    left = max_len = 0
    for right, ch in enumerate(s):
        freq[ch] += 1
        while len(freq) > k:
            l_ch = s[left]
            freq[l_ch] -= 1
            if freq[l_ch] == 0:
                del freq[l_ch]
            left += 1
        max_len = max(max_len, right - left + 1)
    return max_len`
          }
        }
      ]
    },

    // ── 5: Prefix Sum ─────────────────────────────────────────────────────────
    {
      id: 'prefix_sum',
      name: 'Prefix Sum',
      category: 'Arrays',
      emoji: '∑',
      motivation: 'Precompute once, answer any range-sum query in O(1). A cornerstone that appears in DP, graphs, and 2D grids.',
      whenToUse: [
        'Multiple queries asking for the sum of a subarray [l, r].',
        'Count subarrays whose sum equals a target k.',
        'Avoid re-summing the same elements repeatedly.',
        'Problems involving cumulative totals or running averages.'
      ],
      keyInsight: 'prefix[i] = sum of nums[0..i-1]. Range sum(l, r) = prefix[r+1] - prefix[l]. Store prefix sums in a hash map to find target sums in O(1).',
      goldenRule: 3,
      problems: [
        {
          title: 'subarraySum — Subarray Sum Equals K',
          description: 'Count the number of continuous subarrays whose sum equals k. Uses prefix sum + hash map.',
          code: {
            javascript: `function subarraySum(nums, k) {
  const prefixCount = { 0: 1 }; // sum -> occurrences
  let prefixSum = 0, count = 0;
  for (const n of nums) {
    prefixSum += n;
    count += (prefixCount[prefixSum - k] || 0);
    prefixCount[prefixSum] = (prefixCount[prefixSum] || 0) + 1;
  }
  return count;
}

console.log(subarraySum([1, 1, 1], 2)); // 2
console.log(subarraySum([1, 2, 3], 3)); // 2`,
            python: `from collections import defaultdict

def subarraySum(nums, k: int) -> int:
    prefix_count = defaultdict(int, {0: 1})
    prefix_sum = count = 0
    for n in nums:
        prefix_sum += n
        count += prefix_count[prefix_sum - k]
        prefix_count[prefix_sum] += 1
    return count

print(subarraySum([1, 1, 1], 2))  # 2
print(subarraySum([1, 2, 3], 3))  # 2`
          }
        },
        {
          title: 'rangeSum — Range Sum Query O(1)',
          description: 'Build a prefix sum array, then answer any range sum query in constant time.',
          code: {
            javascript: `function buildPrefixSum(nums) {
  const prefix = [0];
  for (const n of nums) prefix.push(prefix[prefix.length - 1] + n);
  return prefix;
}

function rangeSum(prefix, l, r) {
  return prefix[r + 1] - prefix[l];
}

const nums = [1, 2, 3, 4, 5];
const prefix = buildPrefixSum(nums);
console.log(rangeSum(prefix, 1, 3)); // 9  (2+3+4)
console.log(rangeSum(prefix, 0, 4)); // 15`,
            python: `def buildPrefixSum(nums):
    prefix = [0]
    for n in nums:
        prefix.append(prefix[-1] + n)
    return prefix

def rangeSum(prefix, l, r):
    return prefix[r + 1] - prefix[l]

nums = [1, 2, 3, 4, 5]
prefix = buildPrefixSum(nums)
print(rangeSum(prefix, 1, 3))  # 9
print(rangeSum(prefix, 0, 4))  # 15`
          }
        }
      ]
    },

    // ── 6: Stack ──────────────────────────────────────────────────────────────
    {
      id: 'stack',
      name: 'Stack',
      category: 'Linear',
      emoji: '📚',
      motivation: 'Stacks model "most recent unmatched element" — the pattern behind compilers, undo/redo, and 30+ LeetCode problems.',
      whenToUse: [
        'Matching opening/closing pairs (brackets, HTML tags).',
        'Finding the "next greater element" to the right.',
        'Maintaining a monotonically increasing or decreasing sequence.',
        'Evaluating expressions or implementing undo functionality.'
      ],
      keyInsight: 'Push on an opening condition; pop and process on a closing condition. The stack always holds elements still "waiting" for their resolution.',
      goldenRule: 5,
      problems: [
        {
          title: 'isValid — Valid Parentheses',
          description: 'Determine if a string of brackets is valid and properly nested.',
          code: {
            javascript: `function isValid(s) {
  const stack = [];
  const map = { ')': '(', '}': '{', ']': '[' };
  for (const ch of s) {
    if ('({['.includes(ch)) stack.push(ch);
    else if (stack.pop() !== map[ch]) return false;
  }
  return stack.length === 0;
}

console.log(isValid("()[]{}")); // true
console.log(isValid("([)]"));   // false
console.log(isValid("{[]}"));   // true`,
            python: `def isValid(s: str) -> bool:
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}
    for ch in s:
        if ch in '({[':
            stack.append(ch)
        else:
            if not stack or stack.pop() != mapping.get(ch):
                return False
    return len(stack) == 0

print(isValid("()[]{}"))  # True
print(isValid("([)]"))    # False`
          }
        },
        {
          title: 'nextGreaterElements — Next Greater Element',
          description: 'For each element, find the next greater number to its right. Return -1 if none. Uses a monotonic decreasing stack.',
          code: {
            javascript: `function nextGreaterElement(nums) {
  const result = new Array(nums.length).fill(-1);
  const stack = []; // stores indices
  for (let i = 0; i < nums.length; i++) {
    // Current element is the "next greater" for everything smaller in stack
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
      result[stack.pop()] = nums[i];
    }
    stack.push(i);
  }
  return result;
}

console.log(nextGreaterElement([2, 1, 2, 4, 3])); // [4,2,4,-1,-1]
console.log(nextGreaterElement([1, 3, 2, 4]));      // [3,4,4,-1]`,
            python: `def nextGreaterElement(nums):
    result = [-1] * len(nums)
    stack = []  # indices
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] < val:
            result[stack.pop()] = val
        stack.append(i)
    return result

print(nextGreaterElement([2, 1, 2, 4, 3]))  # [4,2,4,-1,-1]`
          }
        }
      ]
    },

    // ── 7: Recursion / DFS ────────────────────────────────────────────────────
    {
      id: 'recursion_dfs',
      name: 'Recursion / DFS',
      category: 'Trees & Graphs',
      emoji: '🌲',
      motivation: 'Recursive thinking is the single most important skill for tree and graph interviews. Every senior engineer must have it.',
      whenToUse: [
        'Problem involves trees, nested structures, or graph traversal.',
        'You need to explore all paths or enumerate solutions.',
        'The problem can be reduced to a smaller version of itself.',
        'You need to flatten or transform a nested structure.'
      ],
      keyInsight: 'Define the base case clearly, then trust the recursion. Every DFS call handles one node; children are handled by recursive calls. Think small → big.',
      goldenRule: 7,
      problems: [
        {
          title: 'flatten — Flatten Nested Array',
          description: 'Flatten an arbitrarily nested array into a one-dimensional array using DFS.',
          code: {
            javascript: `function flatten(arr) {
  const result = [];
  function dfs(items) {
    for (const item of items) {
      if (Array.isArray(item)) dfs(item);
      else result.push(item);
    }
  }
  dfs(arr);
  return result;
}

console.log(flatten([1, [2, [3, [4]], 5]])); // [1,2,3,4,5]
console.log(flatten([[1, 2], [3, [4, 5]]]));  // [1,2,3,4,5]`,
            python: `def flatten(arr):
    result = []
    def dfs(items):
        for item in items:
            if isinstance(item, list):
                dfs(item)
            else:
                result.append(item)
    dfs(arr)
    return result

print(flatten([1, [2, [3, [4]], 5]]))   # [1,2,3,4,5]`
          }
        },
        {
          title: 'subsets — Generate All Subsets (Power Set)',
          description: 'Given an integer array with unique elements, return all possible subsets.',
          code: {
            javascript: `function subsets(nums) {
  const result = [];
  function dfs(start, current) {
    result.push([...current]); // snapshot current subset
    for (let i = start; i < nums.length; i++) {
      current.push(nums[i]);
      dfs(i + 1, current);
      current.pop(); // backtrack
    }
  }
  dfs(0, []);
  return result;
}

console.log(subsets([1, 2, 3]));
// [[], [1], [1,2], [1,2,3], [1,3], [2], [2,3], [3]]`,
            python: `def subsets(nums):
    result = []
    def dfs(start, current):
        result.append(list(current))
        for i in range(start, len(nums)):
            current.append(nums[i])
            dfs(i + 1, current)
            current.pop()
    dfs(0, [])
    return result

print(len(subsets([1, 2, 3])))  # 8 subsets`
          }
        }
      ]
    },

    // ── 8: Binary Search ──────────────────────────────────────────────────────
    {
      id: 'binary_search',
      name: 'Binary Search',
      category: 'Search',
      emoji: '🔍',
      motivation: 'VERY IMPORTANT. Every "search in sorted space" problem should trigger O(log n) thinking. This template covers 15+ LeetCode problems.',
      whenToUse: [
        'The input array (or answer space) is sorted.',
        'Problem asks to "find minimum/maximum satisfying a condition".',
        'You can define a monotonic predicate (false...false...true...true).',
        'Linear search is O(n) but binary can achieve O(log n).'
      ],
      keyInsight: 'Template: left <= right. mid = left + Math.floor((right - left) / 2). Avoid integer overflow. Binary search is not just about searching — it solves optimization problems too.',
      goldenRule: 4,
      problems: [
        {
          title: 'binarySearch — Classic Template',
          description: 'Search for a target in a sorted array. Return its index, or -1 if not found.',
          code: {
            javascript: `function binarySearch(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2); // avoids overflow
    if (nums[mid] === target) return mid;
    else if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}

console.log(binarySearch([-1, 0, 3, 5, 9, 12], 9));  // 4
console.log(binarySearch([-1, 0, 3, 5, 9, 12], 2));  // -1`,
            python: `def binarySearch(nums, target: int) -> int:
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

print(binarySearch([-1, 0, 3, 5, 9, 12], 9))  # 4`
          }
        },
        {
          title: 'findFirstTrue — Predicate Binary Search',
          description: 'Find the first index where a monotonic predicate becomes true. Used in "find minimum satisfying X" problems.',
          code: {
            javascript: `// Generic template — customise predicate for your problem
function findFirstTrue(nums, predicate) {
  let left = 0, right = nums.length - 1, result = -1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (predicate(nums[mid])) {
      result = mid;
      right = mid - 1; // keep searching left for an earlier true
    } else {
      left = mid + 1;
    }
  }
  return result;
}

// Example: first index where value >= 5
const nums = [1, 3, 5, 5, 7, 9];
console.log(findFirstTrue(nums, x => x >= 5)); // 2`,
            python: `import bisect

def findFirstTrue(nums, predicate):
    left, right = 0, len(nums) - 1
    result = -1
    while left <= right:
        mid = left + (right - left) // 2
        if predicate(nums[mid]):
            result = mid
            right = mid - 1
        else:
            left = mid + 1
    return result

# Python built-in:
# bisect.bisect_left(nums, 5) -> first index >= 5
import bisect
nums = [1, 3, 5, 5, 7, 9]
print(bisect.bisect_left(nums, 5))  # 2`
          }
        }
      ]
    },

    // ── 9: Fast & Slow Pointers ───────────────────────────────────────────────
    {
      id: 'fast_slow',
      name: 'Fast & Slow Pointers',
      category: 'Linked Lists',
      emoji: '🐢🐇',
      motivation: "Floyd's cycle detection is one of the most elegant ideas in CS — O(1) space, beautiful proof. Know it cold.",
      whenToUse: [
        'Detecting a cycle in a linked list or array.',
        'Finding the middle of a linked list in one pass.',
        'Detecting the start of a cycle.',
        'Checking if a linked list is a palindrome.'
      ],
      keyInsight: 'If fast and slow ever meet, a cycle exists. When fast (step 2) reaches the end, slow (step 1) is exactly at the middle.',
      goldenRule: 6,
      problems: [
        {
          title: 'hasCycle & findMiddle — Core Floyd Template',
          description: 'Detect a cycle (Floyd\'s algorithm) and find the middle of a linked list using the same fast/slow pattern.',
          code: {
            javascript: `// class ListNode { constructor(val) { this.val = val; this.next = null; } }

function hasCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true; // cycle!
  }
  return false;
}

// Same pattern — finds middle of linked list
function findMiddle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow; // slow stops at middle
}

console.log("Cycle detection and middle-finding use identical structure");`,
            python: `# class ListNode:
#     def __init__(self, val=0):
#         self.val = val
#         self.next = None

def hasCycle(head) -> bool:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False

def findMiddle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow  # at middle`
          }
        }
      ]
    },

    // ── 10: Backtracking ──────────────────────────────────────────────────────
    {
      id: 'backtracking',
      name: 'Backtracking',
      category: 'Recursion',
      emoji: '↩️',
      motivation: 'Every "generate all X" problem — permutations, combos, N-Queens — is solved with this ONE template. Internalize it.',
      whenToUse: [
        'Problem asks to enumerate ALL valid configurations.',
        'You need permutations, combinations, or subsets with constraints.',
        'Grid/maze path finding (word search, robot paths).',
        'Constraint satisfaction problems (Sudoku, N-Queens).'
      ],
      keyInsight: 'Choose → add element. Explore → recurse. Unchoose → remove element. This "undo" step is what separates backtracking from plain DFS and makes it exhaustive without duplicates.',
      goldenRule: 7,
      problems: [
        {
          title: 'permutations — All Permutations',
          description: 'Given an array of distinct integers, return all possible permutations.',
          code: {
            javascript: `function permutations(nums) {
  const result = [];
  function backtrack(current, remaining) {
    if (!remaining.length) {
      result.push([...current]);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      current.push(remaining[i]);             // choose
      backtrack(current,                      // explore
        [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
      current.pop();                          // unchoose
    }
  }
  backtrack([], nums);
  return result;
}

console.log(permutations([1, 2, 3]).length); // 6`,
            python: `def permutations(nums):
    result = []
    def backtrack(current, remaining):
        if not remaining:
            result.append(list(current))
            return
        for i in range(len(remaining)):
            current.append(remaining[i])        # choose
            backtrack(current,                  # explore
                      remaining[:i] + remaining[i+1:])
            current.pop()                       # unchoose
    backtrack([], nums)
    return result

print(len(permutations([1, 2, 3])))  # 6`
          }
        }
      ]
    },

    // ── 11: Monotonic Stack ───────────────────────────────────────────────────
    {
      id: 'monotonic_stack',
      name: 'Monotonic Stack',
      category: 'Linear',
      emoji: '📈',
      motivation: 'Turns O(n²) histogram/temperature problems into O(n). Once you see the pattern, you will recognize it everywhere.',
      whenToUse: [
        'Next greater / next smaller element for every position.',
        'Largest rectangle in histogram.',
        'Trapping rain water.',
        'Finding the nearest smaller element to the left or right.'
      ],
      keyInsight: 'Maintain the stack in strictly increasing or decreasing order. When a new element breaks the invariant, pop elements and record their answers using the new element as the "resolver".',
      goldenRule: 5,
      problems: [
        {
          title: 'nextGreater — Monotonic Decreasing Stack',
          description: 'For each element, find the next greater to its right. The stack stays decreasing (top = smallest waiting element).',
          code: {
            javascript: `function nextGreater(nums) {
  const result = new Array(nums.length).fill(-1);
  const stack = []; // indices; values decrease from bottom to top
  for (let i = 0; i < nums.length; i++) {
    // Pop everything smaller — nums[i] is their "next greater"
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
      result[stack.pop()] = nums[i];
    }
    stack.push(i);
  }
  return result; // remaining in stack have no next greater -> -1
}

console.log(nextGreater([3, 1, 4, 1, 5])); // [4,4,5,5,-1]`,
            python: `def nextGreater(nums):
    result = [-1] * len(nums)
    stack = []  # indices; values decrease bottom->top
    for i, val in enumerate(nums):
        while stack and nums[stack[-1]] < val:
            result[stack.pop()] = val
        stack.append(i)
    return result

print(nextGreater([3, 1, 4, 1, 5]))  # [4, 4, 5, 5, -1]`
          }
        }
      ]
    },

    // ── 12: Heap / Priority Queue ─────────────────────────────────────────────
    {
      id: 'heap',
      name: 'Heap / Priority Queue',
      category: 'Data Structures',
      emoji: '⛰️',
      motivation: '"Top K" and streaming median questions — the heap is the only efficient tool. Python\'s heapq makes this trivial.',
      whenToUse: [
        'You need the k largest or k smallest elements.',
        'Repeatedly extract the minimum or maximum from a changing set.',
        'Merging k sorted arrays or lists.',
        'Scheduling: always process the highest/lowest priority item next.'
      ],
      keyInsight: 'JS has no built-in heap — sort for small inputs or implement MinHeap. Python\'s heapq is a min-heap; negate values for a max-heap. heapq.nlargest / nsmallest are convenient shortcuts.',
      goldenRule: 8,
      problems: [
        {
          title: 'topKFrequent — Top K Frequent Elements',
          description: 'Return the k most frequent elements. Classic heap application.',
          code: {
            javascript: `function topKFrequent(nums, k) {
  const freq = new Map();
  for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1);
  // Sort entries by frequency desc, take first k
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([num]) => num);
}

// For large n, use a min-heap of size k for O(n log k)
console.log(topKFrequent([1, 1, 1, 2, 2, 3], 2)); // [1, 2]
console.log(topKFrequent([1], 1));                   // [1]`,
            python: `import heapq
from collections import Counter

def topKFrequent(nums, k):
    freq = Counter(nums)
    # heapq.nlargest uses a heap internally — O(n log k)
    return heapq.nlargest(k, freq.keys(), key=lambda x: freq[x])

print(topKFrequent([1, 1, 1, 2, 2, 3], 2))  # [1, 2]`
          }
        }
      ]
    },

    // ── 13: Greedy ────────────────────────────────────────────────────────────
    {
      id: 'greedy',
      name: 'Greedy',
      category: 'Optimization',
      emoji: '💰',
      motivation: 'Greedy gives O(n log n) or O(n) solutions where locally optimal = globally optimal. Sort first, then sweep — that is the recipe.',
      whenToUse: [
        'Interval scheduling: merge overlapping, count non-overlapping.',
        'Jump game: can you reach the end?',
        'Coin change with denominations that are multiples of each other.',
        'Any problem where proof of "always take the best available" holds.'
      ],
      keyInsight: 'Greedy works when a locally optimal choice never prevents a globally optimal solution. The burden is on you to prove this — but interviewers often hint at it with the word "minimum" or "maximum".',
      goldenRule: 9,
      problems: [
        {
          title: 'canJump — Jump Game',
          description: 'Each element is your max jump length from that position. Can you reach the last index?',
          code: {
            javascript: `function canJump(nums) {
  let maxReach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > maxReach) return false; // stuck
    maxReach = Math.max(maxReach, i + nums[i]);
  }
  return true;
}

console.log(canJump([2, 3, 1, 1, 4])); // true
console.log(canJump([3, 2, 1, 0, 4])); // false`,
            python: `def canJump(nums) -> bool:
    max_reach = 0
    for i, jump in enumerate(nums):
        if i > max_reach:
            return False
        max_reach = max(max_reach, i + jump)
    return True

print(canJump([2, 3, 1, 1, 4]))  # True
print(canJump([3, 2, 1, 0, 4]))  # False`
          }
        }
      ]
    },

    // ── 14: Graph BFS / DFS ───────────────────────────────────────────────────
    {
      id: 'graph_bfs_dfs',
      name: 'Graph BFS / DFS',
      category: 'Graphs',
      emoji: '🕸️',
      motivation: 'Graph traversal underpins shortest path, connectivity, and social-network problems — very common in FAANG interviews.',
      whenToUse: [
        'Shortest path in an unweighted graph (BFS).',
        'Reachability / connectivity (DFS or BFS).',
        'Number of islands / connected components.',
        'Topological sort (DFS post-order on DAGs).'
      ],
      keyInsight: 'BFS uses a queue → shortest path in unweighted graphs. DFS uses the call stack → exhaustive exploration, cycle detection. Always mark visited nodes before enqueuing/visiting.',
      goldenRule: 4,
      problems: [
        {
          title: 'numIslands — Number of Islands (BFS)',
          description: 'Count connected groups of "1"s in a 2D grid using BFS. Each BFS call floods one island.',
          code: {
            javascript: `function numIslands(grid) {
  let count = 0;
  const rows = grid.length, cols = grid[0].length;
  function bfs(r, c) {
    const queue = [[r, c]];
    grid[r][c] = '0'; // mark visited immediately
    while (queue.length) {
      const [row, col] = queue.shift();
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === '1') {
          queue.push([nr, nc]);
          grid[nr][nc] = '0';
        }
      }
    }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === '1') { bfs(r, c); count++; }
  return count;
}

const grid = [["1","1","0"],["0","1","0"],["0","0","1"]];
console.log(numIslands(grid)); // 2`,
            python: `from collections import deque

def numIslands(grid) -> int:
    if not grid:
        return 0
    count = 0
    rows, cols = len(grid), len(grid[0])
    def bfs(r, c):
        queue = deque([(r, c)])
        grid[r][c] = '0'
        while queue:
            row, col = queue.popleft()
            for dr, dc in [(1,0),(-1,0),(0,1),(0,-1)]:
                nr, nc = row + dr, col + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
                    queue.append((nr, nc))
                    grid[nr][nc] = '0'
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                bfs(r, c)
                count += 1
    return count`
          }
        }
      ]
    },

    // ── 15: Dynamic Programming ───────────────────────────────────────────────
    {
      id: 'dynamic_programming',
      name: 'Dynamic Programming',
      category: 'Optimization',
      emoji: '🧩',
      motivation: 'DP is the final boss of coding interviews. Master the recurrence-first approach and no DP problem will feel impossible again.',
      whenToUse: [
        'Problem has overlapping subproblems (same smaller problem solved repeatedly).',
        'Problem has optimal substructure (optimal = built from optimal sub-solutions).',
        'Keywords: "count ways", "minimum cost", "maximum profit", "longest/shortest".',
        'Recursive brute-force is exponential — memoize it to polynomial.'
      ],
      keyInsight: 'Step 1: write the recursive definition (top-down). Step 2: memoize with a cache. Step 3 (optional): convert to tabulation (bottom-up) for O(1) extra space.',
      goldenRule: 10,
      problems: [
        {
          title: 'fibonacci — Memoized vs Tabulated',
          description: 'Compute the nth Fibonacci number. Shows the full DP progression: brute force → memoization → tabulation.',
          code: {
            javascript: `// 1. Memoized (top-down)
function fibMemo(n, memo = {}) {
  if (n <= 1) return n;
  if (memo[n] !== undefined) return memo[n];
  memo[n] = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
  return memo[n];
}

// 2. Tabulated (bottom-up) — O(n) space
function fibTab(n) {
  if (n <= 1) return n;
  const dp = [0, 1];
  for (let i = 2; i <= n; i++) dp[i] = dp[i-1] + dp[i-2];
  return dp[n];
}

// 3. Space-optimised — O(1) space
function fib(n) {
  if (n <= 1) return n;
  let [a, b] = [0, 1];
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}

console.log(fib(10));  // 55`,
            python: `from functools import lru_cache

# 1. Memoized (top-down)
@lru_cache(maxsize=None)
def fibMemo(n: int) -> int:
    if n <= 1:
        return n
    return fibMemo(n - 1) + fibMemo(n - 2)

# 2. Space-optimised (bottom-up)
def fib(n: int) -> int:
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

print(fib(10))   # 55`
          }
        },
        {
          title: 'climbStairs — Climbing Stairs',
          description: 'Count distinct ways to climb n steps if you can take 1 or 2 steps at a time. Classic DP warmup.',
          code: {
            javascript: `function climbStairs(n) {
  if (n <= 2) return n;
  let prev2 = 1, prev1 = 2;
  for (let i = 3; i <= n; i++) {
    [prev2, prev1] = [prev1, prev1 + prev2];
  }
  return prev1;
}

console.log(climbStairs(2)); // 2
console.log(climbStairs(3)); // 3
console.log(climbStairs(5)); // 8`,
            python: `def climbStairs(n: int) -> int:
    if n <= 2:
        return n
    prev2, prev1 = 1, 2
    for _ in range(3, n + 1):
        prev2, prev1 = prev1, prev1 + prev2
    return prev1

print(climbStairs(5))  # 8`
          }
        }
      ]
    },

    // ── 16: Trie ──────────────────────────────────────────────────────────────
    {
      id: 'trie',
      name: 'Trie',
      category: 'Data Structures',
      emoji: '🌐',
      motivation: 'The optimal data structure for prefix-based string problems — used in autocomplete, spell-checkers, and IP routing tables.',
      whenToUse: [
        'Autocomplete or "starts with prefix" queries.',
        'Word dictionary with fast search and prefix lookup.',
        'Longest common prefix of a set of strings.',
        'Word Search II — finding many words in a grid at once.'
      ],
      keyInsight: 'Each Trie node stores a children map (one entry per character) and an isEnd flag. Insert and search are both O(L) where L is the word length — independent of dictionary size.',
      goldenRule: 10,
      problems: [
        {
          title: 'Trie — Insert, Search, StartsWith',
          description: 'Implement a Trie data structure with the three core operations.',
          code: {
            javascript: `class TrieNode {
  constructor() {
    this.children = {};
    this.isEnd = false;
  }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isEnd = true;
  }

  search(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return node.isEnd;
  }

  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return true;
  }
}

const trie = new Trie();
trie.insert("apple");
console.log(trie.search("apple"));    // true
console.log(trie.search("app"));      // false
console.log(trie.startsWith("app"));  // true`,
            python: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def search(self, word: str) -> bool:
        node = self.root
        for ch in word:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return node.is_end

    def startsWith(self, prefix: str) -> bool:
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return True

trie = Trie()
trie.insert("apple")
print(trie.search("apple"))    # True
print(trie.startsWith("app"))  # True`
          }
        }
      ]
    }

  ]; // end window.DSA_PATTERNS

})();
