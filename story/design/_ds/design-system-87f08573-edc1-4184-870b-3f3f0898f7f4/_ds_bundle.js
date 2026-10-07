/* @ds-bundle: {"format":4,"namespace":"DesignSystem_87f085","components":[],"sourceHashes":{"app-data.js":"5407d195c89e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_87f085 = window.DesignSystem_87f085 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// app-data.js
try { (() => {
window.APP_DATA = function () {
  const sections = [{
    id: 'coding',
    name: 'Coding',
    mono: 'CD',
    accent: 'var(--accent-coding)'
  }, {
    id: 'sysdesign',
    name: 'System Design',
    mono: 'SD',
    accent: 'var(--accent-sysdesign)'
  }, {
    id: 'microservices',
    name: 'Microservices',
    mono: 'MS',
    accent: 'var(--accent-microservices)'
  }, {
    id: 'k8s',
    name: 'Kubernetes & Docker',
    mono: 'K8',
    accent: 'var(--accent-k8s)'
  }, {
    id: 'aws',
    name: 'AWS',
    mono: 'AW',
    accent: 'var(--accent-aws)'
  }, {
    id: 'java',
    name: 'Java',
    mono: 'JV',
    accent: 'var(--accent-java)'
  }, {
    id: 'spring',
    name: 'Spring Boot',
    mono: 'SB',
    accent: 'var(--accent-spring)'
  }, {
    id: 'frontend',
    name: 'Frontend (Next.js)',
    mono: 'FE',
    accent: 'var(--accent-frontend)'
  }];
  const questions = [{
    id: 'q1',
    section: 'coding',
    title: 'Two Sum',
    difficulty: 'Easy',
    leetcode: 'https://leetcode.com/problems/two-sum/',
    confidence: 'High',
    notes: 'Classic hashmap lookup. O(n) time, O(n) space. Remember the complement trick.'
  }, {
    id: 'q2',
    section: 'coding',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    leetcode: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
    confidence: 'Medium',
    notes: 'Sliding window + set. Watch off-by-one on window shrink.'
  }, {
    id: 'q3',
    section: 'coding',
    title: 'Merge k Sorted Lists',
    difficulty: 'Hard',
    leetcode: 'https://leetcode.com/problems/merge-k-sorted-lists/',
    confidence: 'Low',
    notes: 'Revisit heap-based approach, forgot priority queue comparator syntax.'
  }, {
    id: 'q4',
    section: 'sysdesign',
    title: 'Design a URL Shortener',
    difficulty: 'Medium',
    leetcode: 'https://leetcode.com/discuss/interview-question/system-design/',
    confidence: 'High',
    notes: 'Base62 encoding, read-heavy cache in front of DB, collision handling.'
  }, {
    id: 'q5',
    section: 'sysdesign',
    title: 'Design Rate Limiter',
    difficulty: 'Medium',
    leetcode: 'https://leetcode.com/discuss/interview-question/system-design/',
    confidence: 'Medium',
    notes: 'Token bucket vs sliding window log. Discuss distributed counters w/ Redis.'
  }, {
    id: 'q6',
    section: 'microservices',
    title: 'Saga Pattern Trade-offs',
    difficulty: 'Medium',
    leetcode: '#',
    confidence: 'Medium',
    notes: 'Choreography vs orchestration. Compensating transactions.'
  }, {
    id: 'q7',
    section: 'k8s',
    title: 'Explain Pod Lifecycle',
    difficulty: 'Easy',
    leetcode: '#',
    confidence: 'High',
    notes: 'Pending -> Running -> Succeeded/Failed. Probes: liveness vs readiness.'
  }, {
    id: 'q8',
    section: 'k8s',
    title: 'Rolling Update vs Recreate',
    difficulty: 'Easy',
    leetcode: '#',
    confidence: 'Medium',
    notes: 'maxSurge/maxUnavailable tuning for zero-downtime deploys.'
  }, {
    id: 'q9',
    section: 'aws',
    title: 'S3 Consistency Model',
    difficulty: 'Easy',
    leetcode: '#',
    confidence: 'High',
    notes: 'Strong read-after-write consistency since Dec 2020.'
  }, {
    id: 'q10',
    section: 'java',
    title: 'HashMap Internals',
    difficulty: 'Medium',
    leetcode: '#',
    confidence: 'High',
    notes: 'Bucket + linked list -> treeify at 8. Load factor 0.75, resize doubles.'
  }, {
    id: 'q11',
    section: 'spring',
    title: 'Bean Lifecycle & Scopes',
    difficulty: 'Medium',
    leetcode: '#',
    confidence: 'Medium',
    notes: 'Singleton vs prototype. @PostConstruct / @PreDestroy ordering.'
  }, {
    id: 'q12',
    section: 'frontend',
    title: 'App Router vs Pages Router',
    difficulty: 'Medium',
    leetcode: '#',
    confidence: 'Low',
    notes: 'Server components by default, streaming, layouts. Need more hands-on reps.'
  }];
  const docs = [{
    id: 'd1',
    section: 'coding',
    title: 'Big-O Cheat Sheet',
    type: 'Notes from books',
    excerpt: 'Quick reference for common time/space complexities across data structures.',
    body: 'A condensed reference I keep coming back to before interviews.\n\nArrays: access O(1), search O(n), insert/delete O(n).\nHash tables: average O(1) for get/set, worst case O(n).\nBalanced BSTs: O(log n) for search/insert/delete.\nHeaps: O(log n) insert/extract, O(1) peek.\n\nRule of thumb: if the interviewer says "as fast as possible", they usually want you to name the hashmap trade-off first, then justify it.'
  }, {
    id: 'd2',
    section: 'coding',
    title: 'Amazon Onsite — Coding Round Debrief',
    type: 'Real interview experience',
    excerpt: 'What I was actually asked and how the conversation went.',
    body: 'Got a graph traversal question disguised as a "delivery route" problem. Interviewer cared more about how I clarified constraints than the final code.\n\nWhat worked: restating the problem out loud, sketching the graph on the shared doc before writing any code, narrating trade-offs as I went.\n\nWhat I would change: I jumped to DFS too fast — should have asked about graph size first, since BFS with early exit was the better fit for their constraints.'
  }, {
    id: 'd3',
    section: 'sysdesign',
    title: 'Designing for 10x Read Traffic',
    type: 'Best practices',
    excerpt: 'A framework for reasoning about caching layers under interview time pressure.',
    body: 'Start from the access pattern, not the tech. Steps I use:\n\n1. Estimate read:write ratio.\n2. Identify hot keys / celebrity problem.\n3. Pick a cache tier (CDN, app-local, distributed) per layer.\n4. Talk explicitly about invalidation — this is what separates strong answers from average ones.\n\nInterviewers consistently reward naming the invalidation strategy before being asked.'
  }, {
    id: 'd4',
    section: 'k8s',
    title: 'Debugging CrashLoopBackOff',
    type: 'Personal thoughts and solutions',
    excerpt: 'My checklist for the most common pod failure state.',
    body: 'Order I check things in:\n\n1. kubectl logs --previous\n2. kubectl describe pod for events\n3. Resource limits — OOMKilled shows up here\n4. Liveness probe too aggressive?\n\nNine times out of ten it is either a bad env var or a probe that fires before the app finishes booting.'
  }, {
    id: 'd5',
    section: 'java',
    title: 'Why HashMap Iteration Order Isn\'t Guaranteed',
    type: 'Notes from books',
    excerpt: 'Effective Java notes on collection contracts.',
    body: 'HashMap makes no ordering guarantee — bucket placement depends on hashCode() and current capacity. If you need order, reach for LinkedHashMap (insertion order) or TreeMap (sorted).\n\nCode example:\n\nMap<String,Integer> m = new LinkedHashMap<>();\nm.put("b",2); m.put("a",1);\n// iterates b, a — insertion order preserved'
  }, {
    id: 'd6',
    section: 'frontend',
    title: 'Server Components Mental Model',
    type: 'Personal thoughts and solutions',
    excerpt: 'How I explain RSC in interviews without hand-waving.',
    body: 'The framing that finally clicked for me: server components render to a serialized tree on the server and ship zero JS for that subtree. Client components are the interactive islands.\n\nCommon interview trap: being asked to fetch data in a client component when a server component would remove a network waterfall entirely.'
  }];
  return {
    sections,
    questions,
    docs
  };
}();
})(); } catch (e) { __ds_ns.__errors.push({ path: "app-data.js", error: String((e && e.message) || e) }); }

})();
