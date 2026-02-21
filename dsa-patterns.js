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

    // ── 1: Frequency Map ─────────────────────────────────────────────────────
    {
      id: 'freq_map',
      name: 'Frequency Map',
      category: 'Hashing',
      emoji: '🗺️',
      motivation: 'Master this pattern and you instantly solve 20% of LeetCode Easy/Medium. Every experienced interviewer expects it.',
      whenToUse: [
        'Problem asks "how many times does X appear?"',
        'You need to find duplicates, anagrams, or majority elements.',
        'You need to compare element counts between two collections.',
        'You need the first/last occurrence based on count.'
      ],
      keyInsight: 'A plain object turns O(n) count lookups into O(1). Build the frequency map in one pass, answer questions in a second pass. No Map() or Counter — just {}.',
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
            python: `def isAnagram(s, t):
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
print(isAnagram("rat", "car"))          # False`
          }
        },
        {
          title: 'firstUniqChar — First Unique Character',
          description: 'Return index of first non-repeating character, or -1 if none exists.',
          code: {
            javascript: `function firstUniqChar(s) {
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  for (let i = 0; i < s.length; i++) {
    if (freq[s[i]] === 1) return i;
  }
  return -1;
}

console.log(firstUniqChar("leetcode")); // 0
console.log(firstUniqChar("aabb"));     // -1`,
            python: `def firstUniqChar(s):
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    for i in range(len(s)):
        if freq[s[i]] == 1:
            return i
    return -1

print(firstUniqChar("leetcode"))  # 0
print(firstUniqChar("aabb"))      # -1`
          }
        },
        {
          title: 'majorityElement — Majority Element',
          description: 'Find element appearing more than n/2 times. Guaranteed to exist.',
          code: {
            javascript: `function majorityElement(nums) {
  const freq = {};
  let best = nums[0], bestCount = 0;
  for (const n of nums) {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > bestCount) {
      bestCount = freq[n];
      best = n;
    }
  }
  return best;
}

console.log(majorityElement([3, 2, 3]));             // 3
console.log(majorityElement([2, 2, 1, 1, 1, 2, 2])); // 2`,
            python: `def majorityElement(nums):
    freq = {}
    best = nums[0]
    best_count = 0
    for n in nums:
        freq[n] = freq.get(n, 0) + 1
        if freq[n] > best_count:
            best_count = freq[n]
            best = n
    return best

print(majorityElement([3, 2, 3]))             # 3
print(majorityElement([2, 2, 1, 1, 1, 2, 2])) # 2`
          }
        }
      ]
    },

    // ── 2: Two Pointers ──────────────────────────────────────────────────────
    {
      id: 'two_pointers',
      name: 'Two Pointers',
      category: 'Array',
      emoji: '👉👈',
      motivation: 'Turns O(n²) brute force into O(n) elegance. If your array is sorted and you need pairs, always think two pointers first.',
      whenToUse: [
        'Sorted array and you need a pair with a target sum.',
        'In-place removal or deduplication.',
        'Palindrome check on a string.',
        'Container with most water type problems.'
      ],
      keyInsight: 'Start one pointer at each end. Move the pointer that gives you a better answer toward the center. No nested loops.',
      problems: [
        {
          title: 'removeDuplicates — Remove Duplicates In-Place',
          description: 'Given a sorted array, return the new length after removing duplicates in-place.',
          code: {
            javascript: `function removeDuplicates(nums) {
  if (nums.length === 0) return 0;
  let slow = 0;
  for (let fast = 1; fast < nums.length; fast++) {
    if (nums[fast] !== nums[slow]) {
      slow++;
      nums[slow] = nums[fast];
    }
  }
  return slow + 1;
}

const arr = [1, 1, 2, 3, 3];
console.log(removeDuplicates(arr)); // 3  (arr = [1,2,3,...])`,
            python: `def removeDuplicates(nums):
    if len(nums) == 0:
        return 0
    slow = 0
    for fast in range(1, len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1

arr = [1, 1, 2, 3, 3]
print(removeDuplicates(arr))  # 3`
          }
        },
        {
          title: 'twoSumSorted — Two Sum (Sorted Array)',
          description: 'Return 1-based indices where nums[i] + nums[j] = target. Array is sorted.',
          code: {
            javascript: `function twoSumSorted(nums, target) {
  let left = 0, right = nums.length - 1;
  while (left < right) {
    const sum = nums[left] + nums[right];
    if (sum === target) return [left + 1, right + 1];
    if (sum < target) left++;
    else right--;
  }
  return [];
}

console.log(twoSumSorted([2, 7, 11, 15], 9)); // [1, 2]`,
            python: `def twoSumSorted(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        s = nums[left] + nums[right]
        if s == target:
            return [left + 1, right + 1]
        if s < target:
            left += 1
        else:
            right -= 1
    return []

print(twoSumSorted([2, 7, 11, 15], 9))  # [1, 2]`
          }
        },
        {
          title: 'isPalindrome — Palindrome Check',
          description: 'Return true if string reads the same forwards and backwards.',
          code: {
            javascript: `function isPalindrome(s) {
  let left = 0, right = s.length - 1;
  while (left < right) {
    if (s[left] !== s[right]) return false;
    left++;
    right--;
  }
  return true;
}

console.log(isPalindrome("racecar")); // true
console.log(isPalindrome("hello"));   // false`,
            python: `def isPalindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True

print(isPalindrome("racecar"))  # True
print(isPalindrome("hello"))    # False`
          }
        }
      ]
    },

    // ── 3: Sliding Window ────────────────────────────────────────────────────
    {
      id: 'sliding_window',
      name: 'Sliding Window',
      category: 'Array / String',
      emoji: '🪟',
      motivation: 'The go-to pattern for any contiguous subarray problem. Converts O(n·k) brute force into O(n) by expanding/shrinking one window.',
      whenToUse: [
        'Fixed-size window: max/min/sum of k consecutive elements.',
        'Variable-size window: shortest/longest subarray meeting a condition.',
        'Substring problems with a constraint on the window.'
      ],
      keyInsight: 'Add the right element on expansion. Subtract the left element on shrink. The window invariant is always maintained.',
      problems: [
        {
          title: 'maxSumSubarray — Max Sum of Size K',
          description: 'Find the maximum sum of any contiguous subarray of exactly k elements.',
          code: {
            javascript: `function maxSumSubarray(nums, k) {
  let sum = 0, max = -Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];
    if (right >= k - 1) {
      if (sum > max) max = sum;
      sum -= nums[right - (k - 1)];
    }
  }
  return max;
}

console.log(maxSumSubarray([2, 1, 5, 1, 3, 2], 3)); // 9`,
            python: `def maxSumSubarray(nums, k):
    total = 0
    max_sum = float('-inf')
    for right in range(len(nums)):
        total += nums[right]
        if right >= k - 1:
            if total > max_sum:
                max_sum = total
            total -= nums[right - (k - 1)]
    return max_sum

print(maxSumSubarray([2, 1, 5, 1, 3, 2], 3))  # 9`
          }
        },
        {
          title: 'minSubArrayLen — Minimum Length Subarray >= S',
          description: 'Return length of smallest contiguous subarray whose sum is >= s. Return 0 if none.',
          code: {
            javascript: `function minSubArrayLen(s, nums) {
  let left = 0, sum = 0, minLen = Infinity;
  for (let right = 0; right < nums.length; right++) {
    sum += nums[right];
    while (sum >= s) {
      const len = right - left + 1;
      if (len < minLen) minLen = len;
      sum -= nums[left];
      left++;
    }
  }
  return minLen === Infinity ? 0 : minLen;
}

console.log(minSubArrayLen(7, [2, 3, 1, 2, 4, 3])); // 2`,
            python: `def minSubArrayLen(s, nums):
    left = 0
    total = 0
    min_len = float('inf')
    for right in range(len(nums)):
        total += nums[right]
        while total >= s:
            length = right - left + 1
            if length < min_len:
                min_len = length
            total -= nums[left]
            left += 1
    return 0 if min_len == float('inf') else min_len

print(minSubArrayLen(7, [2, 3, 1, 2, 4, 3]))  # 2`
          }
        }
      ]
    },

    // ── 4: Hash + Sliding Window ─────────────────────────────────────────────
    {
      id: 'hash_sliding_window',
      name: 'Hash + Sliding Window',
      category: 'String',
      emoji: '🔍',
      motivation: 'When the sliding window needs to track character frequencies to decide when to shrink, combine a plain object with the window.',
      whenToUse: [
        'Longest substring without repeating characters.',
        'Longest substring with at most K distinct characters.',
        'Minimum window substring.'
      ],
      keyInsight: 'The hash tracks what is inside the window right now. Shrink the left side when the hash violates the constraint.',
      problems: [
        {
          title: 'lengthOfLongestSubstring — No Repeating Chars',
          description: 'Return length of longest substring without any repeating characters.',
          code: {
            javascript: `function lengthOfLongestSubstring(s) {
  const map = {}; // char -> count inside window
  let left = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    map[ch] = (map[ch] || 0) + 1;
    while (map[ch] > 1) {
      map[s[left]]--;
      left++;
    }
    const len = right - left + 1;
    if (len > maxLen) maxLen = len;
  }
  return maxLen;
}

console.log(lengthOfLongestSubstring("abcabcbb")); // 3
console.log(lengthOfLongestSubstring("pwwkew"));   // 3`,
            python: `def lengthOfLongestSubstring(s):
    freq = {}
    left = 0
    max_len = 0
    for right in range(len(s)):
        ch = s[right]
        freq[ch] = freq.get(ch, 0) + 1
        while freq[ch] > 1:
            freq[s[left]] -= 1
            left += 1
        length = right - left + 1
        if length > max_len:
            max_len = length
    return max_len

print(lengthOfLongestSubstring("abcabcbb"))  # 3
print(lengthOfLongestSubstring("pwwkew"))    # 3`
          }
        },
        {
          title: 'longestKDistinct — Longest Substring with At Most K Distinct',
          description: 'Return length of longest substring with at most k distinct characters.',
          code: {
            javascript: `function longestKDistinct(s, k) {
  const freq = {};
  let left = 0, distinct = 0, maxLen = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (!freq[ch]) distinct++;
    freq[ch] = (freq[ch] || 0) + 1;
    while (distinct > k) {
      const leftCh = s[left];
      freq[leftCh]--;
      if (freq[leftCh] === 0) {
        delete freq[leftCh];
        distinct--;
      }
      left++;
    }
    const len = right - left + 1;
    if (len > maxLen) maxLen = len;
  }
  return maxLen;
}

console.log(longestKDistinct("eceba", 2)); // 3  ("ece")`,
            python: `def longestKDistinct(s, k):
    freq = {}
    left = 0
    distinct = 0
    max_len = 0
    for right in range(len(s)):
        ch = s[right]
        if ch not in freq or freq[ch] == 0:
            distinct += 1
        freq[ch] = freq.get(ch, 0) + 1
        while distinct > k:
            left_ch = s[left]
            freq[left_ch] -= 1
            if freq[left_ch] == 0:
                del freq[left_ch]
                distinct -= 1
            left += 1
        length = right - left + 1
        if length > max_len:
            max_len = length
    return max_len

print(longestKDistinct("eceba", 2))  # 3`
          }
        }
      ]
    },

    // ── 5: Prefix Sum ────────────────────────────────────────────────────────
    {
      id: 'prefix_sum',
      name: 'Prefix Sum',
      category: 'Array',
      emoji: '➕',
      motivation: 'Answers range sum queries in O(1) after an O(n) build. Essential for subarray sum problems.',
      whenToUse: [
        'Subarray sum equals K.',
        'Range sum queries (multiple queries on same array).',
        'Count subarrays with a given sum or property.'
      ],
      keyInsight: 'prefix[i] = sum of nums[0..i-1]. Range sum L..R = prefix[R+1] - prefix[L]. For subarray sum = K, track prefix sums seen so far in a plain hash.',
      problems: [
        {
          title: 'subarraySum — Subarray Sum Equals K',
          description: 'Count the number of contiguous subarrays whose elements sum exactly to k.',
          code: {
            javascript: `function subarraySum(nums, k) {
  const map = { 0: 1 }; // prefixSum -> count
  let sum = 0, count = 0;
  for (const n of nums) {
    sum += n;
    if (map[sum - k]) count += map[sum - k];
    map[sum] = (map[sum] || 0) + 1;
  }
  return count;
}

console.log(subarraySum([1, 1, 1], 2)); // 2
console.log(subarraySum([1, 2, 3], 3)); // 2`,
            python: `def subarraySum(nums, k):
    freq = {0: 1}   # prefix_sum -> count
    total = 0
    count = 0
    for n in nums:
        total += n
        count += freq.get(total - k, 0)
        freq[total] = freq.get(total, 0) + 1
    return count

print(subarraySum([1, 1, 1], 2))  # 2
print(subarraySum([1, 2, 3], 3))  # 2`
          }
        },
        {
          title: 'rangeSum — Range Sum Query with Prefix Array',
          description: 'Build a prefix array, then answer sum(L, R) in O(1). No library methods.',
          code: {
            javascript: `function buildPrefix(nums) {
  const prefix = new Array(nums.length + 1).fill(0);
  for (let i = 0; i < nums.length; i++) {
    prefix[i + 1] = prefix[i] + nums[i];
  }
  return prefix;
}

function rangeSum(prefix, l, r) {
  return prefix[r + 1] - prefix[l];
}

const nums = [1, 2, 3, 4, 5];
const prefix = buildPrefix(nums);
console.log(rangeSum(prefix, 1, 3)); // 9  (2+3+4)`,
            python: `def buildPrefix(nums):
    prefix = [0] * (len(nums) + 1)
    for i in range(len(nums)):
        prefix[i + 1] = prefix[i] + nums[i]
    return prefix

def rangeSum(prefix, l, r):
    return prefix[r + 1] - prefix[l]

nums = [1, 2, 3, 4, 5]
prefix = buildPrefix(nums)
print(rangeSum(prefix, 1, 3))  # 9  (2+3+4)`
          }
        }
      ]
    },

    // ── 6: Stack ─────────────────────────────────────────────────────────────
    {
      id: 'stack',
      name: 'Stack',
      category: 'Stack',
      emoji: '📚',
      motivation: 'The stack shines whenever you need to remember the most recent unmatched thing. Parentheses, next greater, and expression problems all fall here.',
      whenToUse: [
        'Matching brackets / parentheses.',
        'Next greater / smaller element.',
        'Evaluating expressions.',
        'Any problem where you need to undo recent state.'
      ],
      keyInsight: 'Push when you have an unresolved element. Pop when you find its match. The stack always holds the pending elements.',
      problems: [
        {
          title: 'isValidParentheses — Valid Brackets',
          description: 'Return true if the string of brackets is properly matched and nested.',
          code: {
            javascript: `function isValidParentheses(s) {
  const stack = [];
  const pair = { ")": "(", "]": "[", "}": "{" };
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else {
      if (stack[stack.length - 1] !== pair[ch]) return false;
      stack.pop();
    }
  }
  return stack.length === 0;
}

console.log(isValidParentheses("()[]{}"));  // true
console.log(isValidParentheses("(]"));      // false`,
            python: `def isValidParentheses(s):
    stack = []
    pair = {")": "(", "]": "[", "}": "{"}
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        else:
            if not stack or stack[-1] != pair[ch]:
                return False
            stack.pop()
    return len(stack) == 0

print(isValidParentheses("()[]{}"))  # True
print(isValidParentheses("(]"))      # False`
          }
        },
        {
          title: 'nextGreaterElements — Next Greater Element',
          description: 'For each element, find the next element to its right that is greater. Return -1 if none.',
          code: {
            javascript: `function nextGreaterElements(nums) {
  const res = new Array(nums.length).fill(-1);
  const stack = []; // stores indices
  for (let i = 0; i < nums.length; i++) {
    while (stack.length && nums[i] > nums[stack[stack.length - 1]]) {
      const idx = stack.pop();
      res[idx] = nums[i];
    }
    stack.push(i);
  }
  return res;
}

console.log(nextGreaterElements([2, 1, 2, 4, 3])); // [4,2,4,-1,-1]`,
            python: `def nextGreaterElements(nums):
    res = [-1] * len(nums)
    stack = []  # stores indices
    for i in range(len(nums)):
        while stack and nums[i] > nums[stack[-1]]:
            idx = stack.pop()
            res[idx] = nums[i]
        stack.append(i)
    return res

print(nextGreaterElements([2, 1, 2, 4, 3]))  # [4, 2, 4, -1, -1]`
          }
        }
      ]
    },

    // ── 7: Recursion / DFS ───────────────────────────────────────────────────
    {
      id: 'recursion_dfs',
      name: 'Recursion / DFS',
      category: 'Tree / Graph',
      emoji: '🌳',
      motivation: 'Trees and graphs are recursive by definition. DFS explores a full path before backtracking. Define the base case, trust the recursive call.',
      whenToUse: [
        'Tree traversal (inorder, preorder, postorder).',
        'Flatten nested structures.',
        'Generate all subsets / permutations.',
        'Count connected components in a grid or graph.'
      ],
      keyInsight: 'Define the base case clearly. Trust the recursive call handles the subproblem. You do not need to trace the full stack — just define the rule.',
      problems: [
        {
          title: 'flatten — Flatten Nested Array',
          description: 'Convert a deeply nested array into a flat array without using Array.flat().',
          code: {
            javascript: `function flatten(arr) {
  const out = [];
  function dfs(a) {
    for (let i = 0; i < a.length; i++) {
      if (Array.isArray(a[i])) {
        dfs(a[i]);
      } else {
        out.push(a[i]);
      }
    }
  }
  dfs(arr);
  return out;
}

console.log(flatten([1, [2, [3, [4]], 5]])); // [1,2,3,4,5]`,
            python: `def flatten(arr):
    out = []
    def dfs(a):
        for item in a:
            if isinstance(item, list):
                dfs(item)
            else:
                out.append(item)
    dfs(arr)
    return out

print(flatten([1, [2, [3, [4]], 5]]))  # [1, 2, 3, 4, 5]`
          }
        },
        {
          title: 'subsets — Generate All Subsets (Power Set)',
          description: 'Return all possible subsets of a list. At each element: either skip it or take it.',
          code: {
            javascript: `function subsets(nums) {
  const res = [];
  function dfs(i, path) {
    if (i === nums.length) {
      res.push(path.slice()); // copy
      return;
    }
    // skip nums[i]
    dfs(i + 1, path);
    // take nums[i]
    path.push(nums[i]);
    dfs(i + 1, path);
    path.pop();
  }
  dfs(0, []);
  return res;
}

console.log(subsets([1, 2, 3]));
// [[],[3],[2],[2,3],[1],[1,3],[1,2],[1,2,3]]`,
            python: `def subsets(nums):
    res = []
    def dfs(i, path):
        if i == len(nums):
            res.append(path[:])  # copy
            return
        # skip nums[i]
        dfs(i + 1, path)
        # take nums[i]
        path.append(nums[i])
        dfs(i + 1, path)
        path.pop()
    dfs(0, [])
    return res

print(subsets([1, 2, 3]))`
          }
        }
      ]
    },

    // ── 8: Binary Search ─────────────────────────────────────────────────────
    {
      id: 'binary_search',
      name: 'Binary Search',
      category: 'Array',
      emoji: '🎯',
      motivation: 'Not just for searching — binary search applies to ANY monotonic answer space. "Find the minimum X satisfying condition" is binary search in disguise.',
      whenToUse: [
        'Array is sorted — find target, first/last occurrence.',
        'Answer space is monotonic — find minimum capacity/speed.',
        'Find peak element or rotated array position.',
        'O(log n) is required — hint is a very large input size.'
      ],
      keyInsight: 'left=0, right=n-1, mid = left + floor((right-left)/2). If too small move left up; if too large move right down. Loop while left <= right.',
      problems: [
        {
          title: 'binarySearch — Classic Binary Search',
          description: 'Find index of target in a sorted array. Return -1 if not found.',
          code: {
            javascript: `function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}

console.log(binarySearch([1, 3, 5, 7, 9], 7));  // 3
console.log(binarySearch([1, 3, 5, 7, 9], 4));  // -1`,
            python: `def binarySearch(arr, target):
    left = 0
    right = len(arr) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

print(binarySearch([1, 3, 5, 7, 9], 7))  # 3
print(binarySearch([1, 3, 5, 7, 9], 4))  # -1`
          }
        }
      ]
    },

    // ── 9: Fast & Slow Pointers ──────────────────────────────────────────────
    {
      id: 'fast_slow',
      name: 'Fast & Slow Pointers',
      category: 'Linked List',
      emoji: '🐢🐇',
      motivation: "Floyd's cycle detection: two pointers at different speeds will meet if and only if there is a cycle. Also finds the middle of a list in O(n) with O(1) space.",
      whenToUse: [
        'Detect a cycle in a linked list.',
        'Find the middle node of a linked list.',
        'Find the start of a cycle.',
        'Check if a number is a happy number.'
      ],
      keyInsight: 'slow moves 1 step, fast moves 2. If fast reaches null — no cycle, slow is at the middle. If slow === fast — cycle exists.',
      problems: [
        {
          title: 'hasCycle + findMiddle — Cycle Detection and Middle Node',
          description: 'Two classic applications of fast and slow pointer using a plain Node structure.',
          code: {
            javascript: `function Node(val) {
  this.val = val;
  this.next = null;
}

// 1. Detect Cycle — O(n) time, O(1) space
function hasCycle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}

// 2. Find Middle Node
function findMiddle(head) {
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow; // slow is at the middle
}

// Build: 1 -> 2 -> 3 -> 4 -> 5
const n1 = new Node(1); const n2 = new Node(2);
const n3 = new Node(3); const n4 = new Node(4);
const n5 = new Node(5);
n1.next = n2; n2.next = n3; n3.next = n4; n4.next = n5;

console.log(hasCycle(n1));       // false
console.log(findMiddle(n1).val); // 3`,
            python: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

# 1. Detect Cycle
def hasCycle(head):
    slow = head
    fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False

# 2. Find Middle Node
def findMiddle(head):
    slow = head
    fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow

# Build: 1 -> 2 -> 3 -> 4 -> 5
n1, n2, n3, n4, n5 = Node(1), Node(2), Node(3), Node(4), Node(5)
n1.next = n2; n2.next = n3; n3.next = n4; n4.next = n5

print(hasCycle(n1))        # False
print(findMiddle(n1).val)  # 3`
          }
        }
      ]
    },

    // ── 10: Backtracking ─────────────────────────────────────────────────────
    {
      id: 'backtracking',
      name: 'Backtracking',
      category: 'Recursion',
      emoji: '↩️',
      motivation: 'Systematically tries every possibility, prunes dead ends early. If DFS explores a tree, backtracking is DFS with an explicit undo step.',
      whenToUse: [
        'Generate all permutations of a list.',
        'Generate all valid combinations (combination sum, N-Queens).',
        'Word search in a grid.',
        'Solve constraint-satisfaction puzzles like Sudoku.'
      ],
      keyInsight: 'Choose → Explore → Unchoose. After the recursive call returns, undo the choice (pop from path). This restores state for the next branch.',
      problems: [
        {
          title: 'permutations — All Permutations',
          description: 'Return all possible orderings of a list of unique integers without using built-in permutation methods.',
          code: {
            javascript: `function permutations(nums) {
  const res = [];
  const used = new Array(nums.length).fill(false);

  function backtrack(path) {
    if (path.length === nums.length) {
      res.push(path.slice()); // copy
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;      // choose
      path.push(nums[i]);
      backtrack(path);     // explore
      path.pop();          // unchoose
      used[i] = false;
    }
  }

  backtrack([]);
  return res;
}

console.log(permutations([1, 2, 3]));
// [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]`,
            python: `def permutations(nums):
    res = []
    used = [False] * len(nums)

    def backtrack(path):
        if len(path) == len(nums):
            res.append(path[:])  # copy
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True      # choose
            path.append(nums[i])
            backtrack(path)     # explore
            path.pop()          # unchoose
            used[i] = False

    backtrack([])
    return res

print(permutations([1, 2, 3]))`
          }
        }
      ]
    },

    // ── 11: Monotonic Stack ──────────────────────────────────────────────────
    {
      id: 'monotonic_stack',
      name: 'Monotonic Stack',
      category: 'Stack',
      emoji: '📉📈',
      motivation: 'Advanced stack where you maintain strictly increasing or decreasing order. Solves "daily temperatures", "largest rectangle", "stock span" in O(n).',
      whenToUse: [
        'Daily temperatures — days until warmer weather.',
        'Largest rectangle in a histogram.',
        'Trapping rain water.',
        'Stock span problem.'
      ],
      keyInsight: 'Keep a decreasing stack of indices. When a larger element arrives, pop and resolve all smaller elements that now have their next-greater found.',
      problems: [
        {
          title: 'dailyTemperatures — Days Until Warmer',
          description: 'For each day, how many days must you wait for a warmer temperature? Return 0 if none.',
          code: {
            javascript: `function dailyTemperatures(temps) {
  const res = new Array(temps.length).fill(0);
  const stack = []; // monotonic decreasing — stores indices

  for (let i = 0; i < temps.length; i++) {
    while (stack.length && temps[i] > temps[stack[stack.length - 1]]) {
      const idx = stack.pop();
      res[idx] = i - idx; // days waited
    }
    stack.push(i);
  }
  return res;
}

console.log(dailyTemperatures([73,74,75,71,69,72,76,73]));
// [1, 1, 4, 2, 1, 1, 0, 0]`,
            python: `def dailyTemperatures(temps):
    res = [0] * len(temps)
    stack = []  # monotonic decreasing — stores indices

    for i in range(len(temps)):
        while stack and temps[i] > temps[stack[-1]]:
            idx = stack.pop()
            res[idx] = i - idx  # days waited
        stack.append(i)
    return res

print(dailyTemperatures([73,74,75,71,69,72,76,73]))
# [1, 1, 4, 2, 1, 1, 0, 0]`
          }
        }
      ]
    },

    // ── 12: Heap ─────────────────────────────────────────────────────────────
    {
      id: 'heap',
      name: 'Heap / Priority Queue',
      category: 'Heap',
      emoji: '🏔️',
      motivation: 'When you need K largest/smallest from a stream without sorting. O(n log k) beats O(n log n) when k << n.',
      whenToUse: [
        'Kth largest or smallest element.',
        'Top K frequent elements.',
        'Merge K sorted lists.',
        'Median from a data stream.'
      ],
      keyInsight: 'Build a min-heap of size k manually using sift-up and sift-down on a plain array. For k-largest: if new element > root, pop root and push new element.',
      problems: [
        {
          title: 'kthLargest — Kth Largest (Manual Min-Heap)',
          description: 'Find kth largest element using a manually implemented min-heap — no built-in PriorityQueue.',
          code: {
            javascript: `function heapPush(heap, val) {
  heap.push(val);
  let i = heap.length - 1;
  while (i > 0) {
    const p = Math.floor((i - 1) / 2);
    if (heap[p] > heap[i]) {
      const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp;
      i = p;
    } else break;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < heap.length && heap[l] < heap[s]) s = l;
      if (r < heap.length && heap[r] < heap[s]) s = r;
      if (s === i) break;
      const tmp = heap[i]; heap[i] = heap[s]; heap[s] = tmp;
      i = s;
    }
  }
  return top;
}

function kthLargest(nums, k) {
  const heap = [];
  for (const n of nums) {
    heapPush(heap, n);
    if (heap.length > k) heapPop(heap);
  }
  return heap[0];
}

console.log(kthLargest([3, 2, 1, 5, 6, 4], 2)); // 5`,
            python: `def heap_push(heap, val):
    heap.append(val)
    i = len(heap) - 1
    while i > 0:
        p = (i - 1) // 2
        if heap[p] > heap[i]:
            heap[p], heap[i] = heap[i], heap[p]
            i = p
        else:
            break

def heap_pop(heap):
    top = heap[0]
    last = heap.pop()
    if heap:
        heap[0] = last
        i = 0
        while True:
            s = i
            l, r = 2*i+1, 2*i+2
            if l < len(heap) and heap[l] < heap[s]:
                s = l
            if r < len(heap) and heap[r] < heap[s]:
                s = r
            if s == i:
                break
            heap[i], heap[s] = heap[s], heap[i]
            i = s
    return top

def kthLargest(nums, k):
    heap = []
    for n in nums:
        heap_push(heap, n)
        if len(heap) > k:
            heap_pop(heap)
    return heap[0]

print(kthLargest([3, 2, 1, 5, 6, 4], 2))  # 5`
          }
        }
      ]
    },

    // ── 13: Greedy ───────────────────────────────────────────────────────────
    {
      id: 'greedy',
      name: 'Greedy',
      category: 'Greedy',
      emoji: '💰',
      motivation: 'Make the locally optimal choice at each step. Interval scheduling and jump problems are classic greedy. Always prove your greedy choice is safe.',
      whenToUse: [
        'Activity selection / interval scheduling (sort by end time).',
        'Jump Game — can you reach the end?',
        'Merge overlapping intervals.',
        'Minimize maximum value.'
      ],
      keyInsight: 'Usually involves sorting + a single scan. Prove: "choosing the locally best option now never blocks a better global solution later."',
      problems: [
        {
          title: 'canJump — Jump Game',
          description: 'Given an array of jump lengths, return true if you can reach the last index from index 0.',
          code: {
            javascript: `function canJump(nums) {
  let maxReach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > maxReach) return false; // can't reach index i
    const reach = i + nums[i];
    if (reach > maxReach) maxReach = reach;
  }
  return true;
}

console.log(canJump([2, 3, 1, 1, 4])); // true
console.log(canJump([3, 2, 1, 0, 4])); // false`,
            python: `def canJump(nums):
    max_reach = 0
    for i in range(len(nums)):
        if i > max_reach:
            return False
        reach = i + nums[i]
        if reach > max_reach:
            max_reach = reach
    return True

print(canJump([2, 3, 1, 1, 4]))  # True
print(canJump([3, 2, 1, 0, 4]))  # False`
          }
        }
      ]
    },

    // ── 14: Graph BFS / DFS ──────────────────────────────────────────────────
    {
      id: 'graph_bfs_dfs',
      name: 'Graph BFS / DFS',
      category: 'Graph',
      emoji: '🕸️',
      motivation: 'BFS gives the shortest path in unweighted graphs. DFS explores all possibilities. Both need a visited set to avoid revisiting.',
      whenToUse: [
        'Number of islands (grid DFS/BFS).',
        'Shortest path in unweighted graph (BFS).',
        'Connected components.',
        'Topological sort (DFS on directed acyclic graph).'
      ],
      keyInsight: 'BFS: use an array as a queue with a front pointer. DFS: use recursion or a plain array as a stack. Always track visited with a plain object or boolean array.',
      problems: [
        {
          title: 'numIslands — Number of Islands (Grid DFS)',
          description: 'Count number of islands in a 2D grid of "1" (land) and "0" (water). Use DFS — sink each visited land cell.',
          code: {
            javascript: `function numIslands(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  let count = 0;

  function dfs(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (grid[r][c] !== '1') return;
    grid[r][c] = '0'; // mark visited by sinking
    dfs(r + 1, c);
    dfs(r - 1, c);
    dfs(r, c + 1);
    dfs(r, c - 1);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '1') {
        count++;
        dfs(r, c);
      }
    }
  }
  return count;
}

const grid = [
  ['1','1','0'],
  ['1','0','0'],
  ['0','0','1']
];
console.log(numIslands(grid)); // 2`,
            python: `def numIslands(grid):
    rows = len(grid)
    cols = len(grid[0])
    count = 0

    def dfs(r, c):
        if r < 0 or r >= rows or c < 0 or c >= cols:
            return
        if grid[r][c] != '1':
            return
        grid[r][c] = '0'  # mark visited by sinking
        dfs(r + 1, c)
        dfs(r - 1, c)
        dfs(r, c + 1)
        dfs(r, c - 1)

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                dfs(r, c)
    return count

grid = [
    ['1','1','0'],
    ['1','0','0'],
    ['0','0','1']
]
print(numIslands(grid))  # 2`
          }
        }
      ]
    },

    // ── 15: Dynamic Programming ──────────────────────────────────────────────
    {
      id: 'dynamic_programming',
      name: 'Dynamic Programming',
      category: 'DP',
      emoji: '🧩',
      motivation: 'When a problem has overlapping subproblems, store results rather than recomputing. Plain array memoization — no library needed.',
      whenToUse: [
        'Climbing stairs / Fibonacci (1D DP).',
        'House Robber (take or skip each element).',
        'Coin change (minimum coins for amount).',
        'Longest common subsequence.'
      ],
      keyInsight: 'Identify state: what uniquely defines the subproblem. Write the recurrence. Store answers in a plain array. Bottom-up tabulation is cleanest for interviews.',
      problems: [
        {
          title: 'climbStairs + rob — 1D DP Classics',
          description: 'Two foundational DP patterns: Fibonacci-style counting and max-value with skip constraint.',
          code: {
            javascript: `// 1. Climbing Stairs — ways to climb n steps (1 or 2 at a time)
function climbStairs(n) {
  if (n <= 2) return n;
  let prev2 = 1, prev1 = 2;
  for (let i = 3; i <= n; i++) {
    const curr = prev1 + prev2;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}

// 2. House Robber — max money without robbing adjacent houses
function rob(nums) {
  if (nums.length === 0) return 0;
  if (nums.length === 1) return nums[0];
  let prev2 = 0, prev1 = 0;
  for (let i = 0; i < nums.length; i++) {
    const curr = prev1 > prev2 + nums[i] ? prev1 : prev2 + nums[i];
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1;
}

console.log(climbStairs(5));         // 8
console.log(rob([2, 7, 9, 3, 1]));  // 12`,
            python: `# 1. Climbing Stairs
def climbStairs(n):
    if n <= 2:
        return n
    prev2, prev1 = 1, 2
    for i in range(3, n + 1):
        curr = prev1 + prev2
        prev2 = prev1
        prev1 = curr
    return prev1

# 2. House Robber
def rob(nums):
    if len(nums) == 0:
        return 0
    if len(nums) == 1:
        return nums[0]
    prev2, prev1 = 0, 0
    for n in nums:
        curr = max(prev1, prev2 + n)
        prev2 = prev1
        prev1 = curr
    return prev1

print(climbStairs(5))         # 8
print(rob([2, 7, 9, 3, 1]))  # 12`
          }
        }
      ]
    },

    // ── 16: Trie ─────────────────────────────────────────────────────────────
    {
      id: 'trie',
      name: 'Trie (Prefix Tree)',
      category: 'Tree',
      emoji: '🔤',
      motivation: 'When you need fast prefix lookups — autocomplete, word search, spell check. O(m) per operation where m is word length.',
      whenToUse: [
        'Autocomplete / prefix search.',
        'Word search in a dictionary.',
        'Longest common prefix.',
        'Count words with a given prefix.'
      ],
      keyInsight: 'Each node stores a plain object as its children map plus an isEnd flag. Insert walks character by character, creating nodes as needed. Search does the same without creating.',
      problems: [
        {
          title: 'Trie — Insert, Search, StartsWith',
          description: 'Implement a Trie from scratch using only plain objects and booleans — no Map or library.',
          code: {
            javascript: `function TrieNode() {
  this.children = {}; // char -> TrieNode
  this.isEnd = false;
}

function Trie() {
  this.root = new TrieNode();
}

Trie.prototype.insert = function(word) {
  let node = this.root;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (!node.children[ch]) node.children[ch] = new TrieNode();
    node = node.children[ch];
  }
  node.isEnd = true;
};

Trie.prototype.search = function(word) {
  let node = this.root;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (!node.children[ch]) return false;
    node = node.children[ch];
  }
  return node.isEnd;
};

Trie.prototype.startsWith = function(prefix) {
  let node = this.root;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (!node.children[ch]) return false;
    node = node.children[ch];
  }
  return true;
};

const trie = new Trie();
trie.insert("apple");
console.log(trie.search("apple"));    // true
console.log(trie.search("app"));      // false
console.log(trie.startsWith("app"));  // true`,
            python: `class TrieNode:
    def __init__(self):
        self.children = {}  # char -> TrieNode
        self.is_end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.is_end = True

    def search(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return node.is_end

    def startsWith(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return True

trie = Trie()
trie.insert("apple")
print(trie.search("apple"))    # True
print(trie.search("app"))      # False
print(trie.startsWith("app"))  # True`
          }
        }
      ]
    }

  ]; // end window.DSA_PATTERNS

})();
