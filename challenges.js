// ParadoxEditor - Coding Challenges
window.ParadoxChallenges = [
  // ===== EASY =====
  {
    id: 'fizzbuzz',
    title: 'FizzBuzz',
    difficulty: 'Easy',
    category: 'Basics',
    description: 'Print numbers 1 to n. For multiples of 3 print "Fizz", for multiples of 5 print "Buzz", for multiples of both print "FizzBuzz".',
    starterCode: {
      javascript: `function fizzBuzz(n) {
  // Your code here
  for (let i = 1; i <= n; i++) {
    // TODO
  }
}
fizzBuzz(15);`,
      python: `def fizz_buzz(n):
    # Your code here
    for i in range(1, n + 1):
        pass  # TODO

fizz_buzz(15)`
    },
    testCases: [
      { input: 3, expected: 'Fizz' },
      { input: 5, expected: 'Buzz' },
      { input: 15, expected: 'FizzBuzz' }
    ],
    hints: [
      'Use the modulo operator (%) to check divisibility.',
      'Check for divisibility by both 3 and 5 first, before checking individually.',
      'Use console.log() for each number.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'reverse-string',
    title: 'Reverse a String',
    difficulty: 'Easy',
    category: 'Strings',
    description: 'Write a function that reverses a string. The input is a string, and you must return the reversed string.',
    starterCode: {
      javascript: `function reverseString(s) {
  // Your code here
}
console.log(reverseString("hello"));    // → "olleh"
console.log(reverseString("world"));    // → "dlrow"`,
      python: `def reverse_string(s):
    # Your code here
    pass

print(reverse_string("hello"))   # → "olleh"
print(reverse_string("world"))   # → "dlrow"`
    },
    hints: [
      'In JavaScript, split the string into an array of characters.',
      'Reverse the array and join back to a string.',
      'Or use two pointers: one at start, one at end.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'palindrome',
    title: 'Valid Palindrome',
    difficulty: 'Easy',
    category: 'Strings',
    description: 'A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing all non-alphanumeric characters, it reads the same forward and backward.',
    starterCode: {
      javascript: `function isPalindrome(s) {
  // Your code here
}
console.log(isPalindrome("A man, a plan, a canal: Panama"));  // → true
console.log(isPalindrome("race a car"));  // → false`,
      python: `def is_palindrome(s):
    # Your code here
    pass

print(is_palindrome("A man, a plan, a canal: Panama"))  # → True
print(is_palindrome("race a car"))  # → False`
    },
    hints: [
      'First clean the string: lowercase and remove non-alphanumeric.',
      'Use two pointers from both ends of the cleaned string.',
      'In Python: s.lower() and filter with isalnum().'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'contains-duplicate',
    title: 'Contains Duplicate',
    difficulty: 'Easy',
    category: 'Arrays',
    description: 'Given an integer array, return true if any value appears at least twice, and false if every element is distinct.',
    starterCode: {
      javascript: `function containsDuplicate(nums) {
  // Your code here
}
console.log(containsDuplicate([1, 2, 3, 1]));       // → true
console.log(containsDuplicate([1, 2, 3, 4]));       // → false`,
      python: `def contains_duplicate(nums):
    # Your code here
    pass

print(contains_duplicate([1, 2, 3, 1]))  # → True
print(contains_duplicate([1, 2, 3, 4]))  # → False`
    },
    hints: [
      'Use a Set to track seen values.',
      'If you see a value already in the Set, return true.',
      'A Set lookup is O(1) average.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'max-array',
    title: 'Find Maximum',
    difficulty: 'Easy',
    category: 'Arrays',
    description: 'Given an array of integers, find the maximum value without using Math.max or built-in max functions.',
    starterCode: {
      javascript: `function findMax(nums) {
  // Your code here — don't use Math.max!
}
console.log(findMax([3, 1, 4, 1, 5, 9, 2, 6]));  // → 9
console.log(findMax([-5, -3, -1, -4]));           // → -1`,
      python: `def find_max(nums):
    # Your code here — don't use built-in max!
    pass

print(find_max([3, 1, 4, 1, 5, 9, 2, 6]))  # → 9
print(find_max([-5, -3, -1, -4]))           # → -1`
    },
    hints: [
      'Start with the first element as your current maximum.',
      'Iterate through the rest, updating the max when you find a larger value.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },

  // ===== MEDIUM =====
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Medium',
    category: 'Arrays',
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. Assume exactly one solution exists.',
    starterCode: {
      javascript: `function twoSum(nums, target) {
  // Your code here
}
console.log(twoSum([2, 7, 11, 15], 9));   // → [0, 1]
console.log(twoSum([3, 2, 4], 6));        // → [1, 2]`,
      python: `def two_sum(nums, target):
    # Your code here
    pass

print(two_sum([2, 7, 11, 15], 9))  # → [0, 1]
print(two_sum([3, 2, 4], 6))       # → [1, 2]`
    },
    hints: [
      'A brute force O(n²) approach uses two nested loops.',
      'Can you do it in O(n) with a hash map?',
      'For each number, check if (target - number) is already in your hash map.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    difficulty: 'Medium',
    category: 'Searching',
    description: 'Given a sorted array of distinct integers and a target value, return the index of target if found, or -1 if not. Your solution must run in O(log n) time.',
    starterCode: {
      javascript: `function search(nums, target) {
  // Your code here — must be O(log n)!
}
console.log(search([-1, 0, 3, 5, 9, 12], 9));   // → 4
console.log(search([-1, 0, 3, 5, 9, 12], 2));   // → -1`,
      python: `def search(nums, target):
    # Your code here — must be O(log n)!
    pass

print(search([-1, 0, 3, 5, 9, 12], 9))  # → 4
print(search([-1, 0, 3, 5, 9, 12], 2))  # → -1`
    },
    hints: [
      'Use two pointers: left = 0, right = len - 1.',
      'Compute mid = Math.floor((left + right) / 2).',
      'If nums[mid] < target, search right half. If nums[mid] > target, search left half.'
    ],
    expectedComplexity: { time: 'O(log n)', space: 'O(1)' }
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Medium',
    category: 'Stacks',
    description: 'Given a string containing just "(" ")" "{" "}" "[" "]", determine if the input string is valid. Brackets must close in the correct order.',
    starterCode: {
      javascript: `function isValid(s) {
  // Your code here
}
console.log(isValid("()"));      // → true
console.log(isValid("()[]{}"));  // → true
console.log(isValid("(]"));      // → false`,
      python: `def is_valid(s):
    # Your code here
    pass

print(is_valid("()"))       # → True
print(is_valid("()[]{}"))   # → True
print(is_valid("(]"))       # → False`
    },
    hints: [
      'Use a stack data structure.',
      'Push opening brackets onto the stack.',
      'When you see a closing bracket, check if it matches the top of the stack.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'max-subarray',
    title: "Maximum Subarray (Kadane's)",
    difficulty: 'Medium',
    category: 'Dynamic Programming',
    description: "Given an integer array, find the contiguous subarray with the largest sum and return its sum. This is Kadane's algorithm.",
    starterCode: {
      javascript: `function maxSubArray(nums) {
  // Your code here — Kadane's algorithm
}
console.log(maxSubArray([-2,1,-3,4,-1,2,1,-5,4]));  // → 6
console.log(maxSubArray([1]));                        // → 1`,
      python: `def max_sub_array(nums):
    # Your code here — Kadane's algorithm
    pass

print(max_sub_array([-2,1,-3,4,-1,2,1,-5,4]))  # → 6
print(max_sub_array([1]))                        # → 1`
    },
    hints: [
      "Kadane's algorithm: keep a running sum and reset to 0 if it goes negative.",
      'Track the maximum sum seen so far.',
      "Actually: don't reset to 0 — reset to current element if running sum + current < current."
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'anagram',
    title: 'Valid Anagram',
    difficulty: 'Medium',
    category: 'Strings',
    description: 'Given two strings s and t, return true if t is an anagram of s, and false otherwise. An anagram uses the same characters in a different order.',
    starterCode: {
      javascript: `function isAnagram(s, t) {
  // Your code here
}
console.log(isAnagram("anagram", "nagaram"));  // → true
console.log(isAnagram("rat", "car"));          // → false`,
      python: `def is_anagram(s, t):
    # Your code here
    pass

print(is_anagram("anagram", "nagaram"))  # → True
print(is_anagram("rat", "car"))          # → False`
    },
    hints: [
      'If lengths differ, return false immediately.',
      'Use a frequency counter (hash map) for each string.',
      'Or sort both strings and compare — but that is O(n log n).'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'move-zeroes',
    title: 'Move Zeroes',
    difficulty: 'Medium',
    category: 'Arrays',
    description: 'Given an integer array, move all 0s to the end while maintaining the relative order of the non-zero elements. Do it in-place.',
    starterCode: {
      javascript: `function moveZeroes(nums) {
  // Your code here — in-place, no extra array
  console.log(nums);  // show result
}
moveZeroes([0, 1, 0, 3, 12]);  // → [1, 3, 12, 0, 0]
moveZeroes([0]);               // → [0]`,
      python: `def move_zeroes(nums):
    # Your code here — in-place, no extra list
    print(nums)  # show result

move_zeroes([0, 1, 0, 3, 12])  # → [1, 3, 12, 0, 0]
move_zeroes([0])               # → [0]`
    },
    hints: [
      'Use a two-pointer approach.',
      'Keep a pointer for the position of the next non-zero slot.',
      'Swap non-zero elements to the front, zeroes will fill the rest.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },

  // ===== HARD =====
  {
    id: 'climbing-stairs',
    title: 'Climbing Stairs',
    difficulty: 'Medium',
    category: 'Dynamic Programming',
    description: 'You are climbing a staircase that takes n steps. Each time you can climb 1 or 2 steps. How many distinct ways can you climb to the top?',
    starterCode: {
      javascript: `function climbStairs(n) {
  // Your code here
}
console.log(climbStairs(2));  // → 2 (1+1, 2)
console.log(climbStairs(3));  // → 3 (1+1+1, 1+2, 2+1)
console.log(climbStairs(5));  // → 8`,
      python: `def climb_stairs(n):
    # Your code here
    pass

print(climb_stairs(2))  # → 2
print(climb_stairs(3))  # → 3
print(climb_stairs(5))  # → 8`
    },
    hints: [
      'This is the Fibonacci sequence!',
      'Ways to reach step n = ways to reach step (n-1) + ways to reach step (n-2).',
      'Use dynamic programming or memoization — avoid pure recursion.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'reverse-linked-list',
    title: 'Reverse Linked List',
    difficulty: 'Medium',
    category: 'Linked Lists',
    description: 'Reverse a singly linked list. Given the head of a linked list, return the reversed list.',
    starterCode: {
      javascript: `class ListNode {
  constructor(val, next = null) { this.val = val; this.next = next; }
}

function reverseList(head) {
  // Your code here
}

// Helper: array to linked list
function fromArray(arr) {
  let head = null;
  for (let i = arr.length - 1; i >= 0; i--) head = new ListNode(arr[i], head);
  return head;
}
// Helper: linked list to array
function toArray(head) {
  const arr = [];
  while (head) { arr.push(head.val); head = head.next; }
  return arr;
}

const list = fromArray([1, 2, 3, 4, 5]);
console.log(toArray(reverseList(list)));  // → [5, 4, 3, 2, 1]`,
      python: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverse_list(head):
    # Your code here
    pass

# Helpers
def from_array(arr):
    head = None
    for val in reversed(arr):
        head = ListNode(val, head)
    return head

def to_array(head):
    arr = []
    while head:
        arr.append(head.val)
        head = head.next
    return arr

lst = from_array([1, 2, 3, 4, 5])
print(to_array(reverse_list(lst)))  # → [5, 4, 3, 2, 1]`
    },
    hints: [
      'Use three pointers: prev, curr, next.',
      'At each step: save next = curr.next, set curr.next = prev, move prev and curr forward.',
      'When curr is null, prev is your new head.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(1)' }
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'Hard',
    category: 'Arrays',
    description: 'Given an array of intervals where intervals[i] = [start, end], merge all overlapping intervals and return an array of non-overlapping intervals.',
    starterCode: {
      javascript: `function merge(intervals) {
  // Your code here
}
console.log(merge([[1,3],[2,6],[8,10],[15,18]]));  // → [[1,6],[8,10],[15,18]]
console.log(merge([[1,4],[4,5]]));                 // → [[1,5]]`,
      python: `def merge(intervals):
    # Your code here
    pass

print(merge([[1,3],[2,6],[8,10],[15,18]]))  # → [[1,6],[8,10],[15,18]]
print(merge([[1,4],[4,5]]))                 # → [[1,5]]`
    },
    hints: [
      'Sort intervals by start time first.',
      'Keep a result list. For each interval, check if it overlaps the last merged interval.',
      'Two intervals [a,b] and [c,d] overlap if c <= b. Merge them as [a, max(b,d)].'
    ],
    expectedComplexity: { time: 'O(n log n)', space: 'O(n)' }
  },
  {
    id: 'longest-substring',
    title: 'Longest Substring Without Repeating',
    difficulty: 'Hard',
    category: 'Strings',
    description: 'Given a string, find the length of the longest substring without repeating characters.',
    starterCode: {
      javascript: `function lengthOfLongestSubstring(s) {
  // Your code here
}
console.log(lengthOfLongestSubstring("abcabcbb"));  // → 3
console.log(lengthOfLongestSubstring("bbbbb"));     // → 1
console.log(lengthOfLongestSubstring("pwwkew"));    // → 3`,
      python: `def length_of_longest_substring(s):
    # Your code here
    pass

print(length_of_longest_substring("abcabcbb"))  # → 3
print(length_of_longest_substring("bbbbb"))     # → 1
print(length_of_longest_substring("pwwkew"))    # → 3`
    },
    hints: [
      'Use the sliding window technique.',
      'Keep a window [left, right] and a set of characters in the window.',
      'When you see a duplicate, shrink the window from the left until the duplicate is removed.'
    ],
    expectedComplexity: { time: 'O(n)', space: 'O(min(n, alphabet))' }
  },
  {
    id: 'coin-change',
    title: 'Coin Change',
    difficulty: 'Hard',
    category: 'Dynamic Programming',
    description: 'Given coins of different denominations and an amount, compute the fewest number of coins needed to make up that amount. Return -1 if not possible.',
    starterCode: {
      javascript: `function coinChange(coins, amount) {
  // Your code here — DP bottom-up
}
console.log(coinChange([1, 5, 11], 15));  // → 3 (5+5+5)
console.log(coinChange([2], 3));           // → -1`,
      python: `def coin_change(coins, amount):
    # Your code here — DP bottom-up
    pass

print(coin_change([1, 5, 11], 15))  # → 3
print(coin_change([2], 3))           # → -1`
    },
    hints: [
      'Create a dp array of size (amount + 1), initialized to Infinity (or amount + 1).',
      'dp[0] = 0 (base case: 0 coins needed for amount 0).',
      'For each amount i: dp[i] = min(dp[i], dp[i - coin] + 1) for each coin <= i.'
    ],
    expectedComplexity: { time: 'O(amount × coins)', space: 'O(amount)' }
  },
];
