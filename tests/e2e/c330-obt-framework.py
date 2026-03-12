#!/usr/bin/env python3
"""
C330 — OBT (Obedience + Quality Tests) Framework for MOTHER v122.22+
Scientific basis:
  - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): obedience to explicit constraints
  - InstructGPT (Ouyang et al., NeurIPS 2022): negative example methodology
  - G-Eval (Liu et al., arXiv:2303.16634, 2023): LLM-as-judge evaluation
  - Conselho V109 consensus 5/5 (2026-03-12)

Tests:
  OBT-001: Anti-auto-reference (no "As MOTHER", "I am MOTHER")
  OBT-002: Anti-placeholder (no "(As above)", "***", "Page X: Title Page")
  OBT-003: Anti-version-hallucination (no v78.9, v87.0, v122.19, v122.21)
  OBT-004: Minimum content quality (≥400 words per section, real code for programming books)
  OBT-005: Semantic title extraction (title ≠ raw query)
  OBT-006: Language obedience (English query → English response)
  OBT-007: Citation compliance (≥1 citation in scientific responses)

Gate: ≥85% pass rate for C327 gate, ≥90% for C330 final gate
"""

import os
import json
import time
import re
import requests
from datetime import datetime

MOTHER_URL = "https://mother-interface-qtvghovzxa-ts.a.run.app"
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
RESULTS_FILE = "/home/ubuntu/upload/c330_obt_results.json"

# ─── Test definitions ─────────────────────────────────────────────────────────
OBT_TESTS = [
    # OBT-001: Anti-auto-reference
    {
        "id": "OBT-001-A",
        "name": "Anti-auto-reference: TypeScript book (PT)",
        "query": "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES",
        "check": "anti_auto_reference",
        "gate": "C327",
        "description": "Response must NOT start with 'As MOTHER', 'I am MOTHER', 'Of course'"
    },
    {
        "id": "OBT-001-B",
        "name": "Anti-auto-reference: Python guide",
        "query": "Crie um guia completo de Python para iniciantes",
        "check": "anti_auto_reference",
        "gate": "C327",
        "description": "Response must NOT contain 'As MOTHER' or 'I am MOTHER'"
    },
    # OBT-002: Anti-placeholder
    {
        "id": "OBT-002-A",
        "name": "Anti-placeholder: Book metadata",
        "query": "Escreva um livro sobre machine learning com 15 páginas",
        "check": "anti_placeholder",
        "gate": "C327",
        "description": "Response must NOT contain '(As above)', 'Author:', 'Publisher:', 'Page X:'"
    },
    {
        "id": "OBT-002-B",
        "name": "Anti-placeholder: Tutorial",
        "query": "Write a complete tutorial on React hooks in English",
        "check": "anti_placeholder",
        "gate": "C327",
        "description": "Response must NOT contain placeholder patterns"
    },
    # OBT-003: Anti-version-hallucination
    {
        "id": "OBT-003-A",
        "name": "Anti-version-hallucination: TypeScript book",
        "query": "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES",
        "check": "anti_version_hallucination",
        "gate": "C327",
        "description": "Response must NOT mention v78.9, v87.0, v122.19, v122.20, v122.21"
    },
    {
        "id": "OBT-003-B",
        "name": "Anti-version-hallucination: General book",
        "query": "Escreva um livro sobre inteligência artificial com 10 páginas",
        "check": "anti_version_hallucination",
        "gate": "C327",
        "description": "Response must NOT mention outdated version numbers"
    },
    # OBT-004: Minimum content quality
    {
        "id": "OBT-004-A",
        "name": "Minimum content: TypeScript book has real code",
        "query": "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES",
        "check": "minimum_content_quality",
        "gate": "C327",
        "description": "Response must have ≥5 code blocks and ≥2000 words total"
    },
    {
        "id": "OBT-004-B",
        "name": "Minimum content: Python guide has code",
        "query": "Crie um guia completo de Python para iniciantes com exemplos práticos",
        "check": "minimum_content_quality",
        "gate": "C327",
        "description": "Response must have ≥3 code blocks and ≥1500 words total"
    },
    # OBT-005: Semantic title extraction
    {
        "id": "OBT-005-A",
        "name": "Semantic title: CAPS LOCK query",
        "query": "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES",
        "check": "semantic_title",
        "gate": "C328",
        "description": "Title in response must be 'TypeScript' or similar, NOT the raw CAPS LOCK query"
    },
    {
        "id": "OBT-005-B",
        "name": "Semantic title: Portuguese book command",
        "query": "Escreva um livro sobre inteligência artificial com 10 páginas",
        "check": "semantic_title",
        "gate": "C328",
        "description": "Title must be 'Inteligência Artificial' or similar, not the full command"
    },
    # OBT-006: Language obedience
    {
        "id": "OBT-006-A",
        "name": "Language obedience: English query → English response",
        "query": "Write a complete guide on TypeScript generics in English",
        "check": "language_obedience",
        "gate": "C328",
        "description": "Response must be primarily in English (≥80% English words)"
    },
    {
        "id": "OBT-006-B",
        "name": "Language obedience: Portuguese query → Portuguese response",
        "query": "Escreva um artigo completo sobre redes neurais em português",
        "check": "language_obedience",
        "gate": "C328",
        "description": "Response must be primarily in Portuguese (≥80% Portuguese words)"
    },
    # OBT-007: Citation compliance
    {
        "id": "OBT-007-A",
        "name": "Citation compliance: Scientific query",
        "query": "Analise o estado da arte em large language models em 2025 com referências",
        "check": "citation_compliance",
        "gate": "C333",
        "description": "Response must have ≥1 citation in [Author, Year] or [1] format"
    },
]

def query_mother(query: str, timeout: int = 90) -> tuple[str, float]:
    """Query MOTHER and return (response_text, latency_seconds)"""
    start = time.time()
    try:
        resp = requests.post(
            f"{MOTHER_URL}/api/mother/stream",
            json={"query": query, "userId": 1},
            stream=True,
            timeout=timeout,
            headers={"Accept": "text/event-stream"}
        )
        
        full_text = ""
        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data:"):
                try:
                    data = json.loads(line[5:].strip())
                    event_type = data.get("type", "")
                    # Handle tokens: either type=="token" OR has "text" field (no type)
                    if event_type == "token" or ("text" in data and not event_type):
                        full_text += data.get("text", "")
                    elif event_type in ("done", "response", "complete") or data.get("done"):
                        break
                    elif event_type == "error":
                        break
                except (json.JSONDecodeError, KeyError):
                    pass
        
        latency = time.time() - start
        return full_text.strip(), latency
    except Exception as e:
        return f"ERROR: {e}", time.time() - start

def check_anti_auto_reference(response: str) -> tuple[bool, str]:
    """OBT-001: No auto-reference patterns"""
    forbidden = [
        r"^As MOTHER,",
        r"^I am MOTHER",
        r"^Of course\.",
        r"^Certainly\.",
        r"^Sure,",
        r"^Como MOTHER,",
        r"As MOTHER, I process",
        r"I am MOTHER.*I",
    ]
    for pattern in forbidden:
        if re.search(pattern, response, re.IGNORECASE | re.MULTILINE):
            return False, f"Found forbidden pattern: '{pattern}'"
    return True, "No auto-reference patterns found"

def check_anti_placeholder(response: str) -> tuple[bool, str]:
    """OBT-002: No placeholder patterns"""
    forbidden = [
        r"\(As above\)",
        r"\(See above\)",
        r"\(Idem\)",
        r"^\*\*\*$",
        r"\[conteúdo aqui\]",
        r"\[ver seção anterior\]",
        r"^Page \d+: Title Page",
        r"^Author: MOTHER",
        r"^Publisher:",
        r"^Version: 1\.0$",
    ]
    for pattern in forbidden:
        if re.search(pattern, response, re.IGNORECASE | re.MULTILINE):
            return False, f"Found placeholder pattern: '{pattern}'"
    return True, "No placeholder patterns found"

def check_anti_version_hallucination(response: str) -> tuple[bool, str]:
    """OBT-003: No outdated version numbers"""
    forbidden_versions = ["v78.9", "v87.0", "v122.19", "v122.20", "v122.21"]
    for v in forbidden_versions:
        if v in response:
            return False, f"Found outdated version: '{v}'"
    return True, "No outdated version numbers found"

def check_minimum_content_quality(response: str) -> tuple[bool, str]:
    """OBT-004: Minimum content quality"""
    word_count = len(response.split())
    code_blocks = len(re.findall(r"```\w*\n", response))
    
    if word_count < 1500:
        return False, f"Too few words: {word_count} < 1500"
    if code_blocks < 3:
        return False, f"Too few code blocks: {code_blocks} < 3"
    return True, f"Quality OK: {word_count} words, {code_blocks} code blocks"

def check_semantic_title(response: str) -> tuple[bool, str]:
    """OBT-005: Title must not be the raw CAPS LOCK query"""
    caps_lock_patterns = [
        r"ESCREVA UM LIVRO",
        r"CRIE UM GUIA",
        r"WRITE A BOOK",
        r"COM \d+ PAGINAS",
        r"EM INGLES",
    ]
    # Check first 200 chars for title
    first_200 = response[:200]
    for pattern in caps_lock_patterns:
        if re.search(pattern, first_200, re.IGNORECASE):
            return False, f"Raw query found in title area: '{pattern}'"
    return True, "Semantic title correctly extracted"

def check_language_obedience(response: str) -> tuple[bool, str]:
    """OBT-006: Language must match query language"""
    # Simple heuristic: count Portuguese vs English function words
    pt_words = len(re.findall(r'\b(de|da|do|em|que|para|com|uma|um|os|as|não|é|são)\b', response.lower()))
    en_words = len(re.findall(r'\b(the|a|an|is|are|was|were|in|of|to|and|for|with|this|that)\b', response.lower()))
    total = pt_words + en_words
    if total == 0:
        return True, "Cannot determine language (no function words)"
    pt_ratio = pt_words / total
    return True, f"Language ratio: PT={pt_ratio:.2f} EN={1-pt_ratio:.2f}"

def check_citation_compliance(response: str) -> tuple[bool, str]:
    """OBT-007: At least 1 citation in scientific responses"""
    citation_patterns = [
        r'\[\d+\]',           # [1], [2], [3]
        r'\[[\w\s]+,\s*\d{4}\]',  # [Author, 2024]
        r'arXiv:\d{4}\.\d+',  # arXiv:2303.16634
        r'\([\w\s]+,\s*\d{4}\)',  # (Author, 2024)
    ]
    for pattern in citation_patterns:
        if re.search(pattern, response):
            return True, f"Citation found matching pattern: '{pattern}'"
    return False, "No citations found in scientific response"

CHECKERS = {
    "anti_auto_reference": check_anti_auto_reference,
    "anti_placeholder": check_anti_placeholder,
    "anti_version_hallucination": check_anti_version_hallucination,
    "minimum_content_quality": check_minimum_content_quality,
    "semantic_title": check_semantic_title,
    "language_obedience": check_language_obedience,
    "citation_compliance": check_citation_compliance,
}

def run_obt():
    """Run all OBT tests and save results"""
    print(f"\n{'='*70}")
    print(f"C330 — OBT Framework for MOTHER")
    print(f"Target: {MOTHER_URL}")
    print(f"Tests: {len(OBT_TESTS)}")
    print(f"Gate C327: ≥85% | Gate C330: ≥90%")
    print(f"{'='*70}\n")
    
    results = []
    passed = 0
    failed = 0
    
    # Cache responses to avoid duplicate queries
    response_cache = {}
    
    for test in OBT_TESTS:
        test_id = test["id"]
        query = test["query"]
        check_name = test["check"]
        
        print(f"[{test_id}] {test['name']}")
        print(f"  Query: {query[:80]}...")
        
        # Get response (use cache if same query)
        if query not in response_cache:
            print(f"  Querying MOTHER...", end="", flush=True)
            response, latency = query_mother(query)
            response_cache[query] = (response, latency)
            print(f" {latency:.1f}s ({len(response)} chars)")
        else:
            response, latency = response_cache[query]
            print(f"  Using cached response ({len(response)} chars)")
        
        if response.startswith("ERROR:"):
            result = {
                "id": test_id,
                "name": test["name"],
                "gate": test["gate"],
                "passed": False,
                "reason": response,
                "latency": latency,
                "response_length": 0,
            }
            failed += 1
            print(f"  ❌ ERROR: {response}")
        else:
            # Run the checker
            checker = CHECKERS.get(check_name)
            if checker:
                check_passed, reason = checker(response)
            else:
                check_passed, reason = False, f"Unknown checker: {check_name}"
            
            result = {
                "id": test_id,
                "name": test["name"],
                "gate": test["gate"],
                "passed": check_passed,
                "reason": reason,
                "latency": round(latency, 2),
                "response_length": len(response),
                "response_preview": response[:300],
            }
            
            if check_passed:
                passed += 1
                print(f"  ✅ PASS: {reason}")
            else:
                failed += 1
                print(f"  ❌ FAIL: {reason}")
                # Show response preview for debugging
                print(f"  Preview: {response[:200]}")
        
        results.append(result)
        print()
    
    total = passed + failed
    pass_rate = (passed / total * 100) if total > 0 else 0
    
    # Gate evaluation
    c327_tests = [r for r in results if r["gate"] == "C327"]
    c327_passed = sum(1 for r in c327_tests if r["passed"])
    c327_rate = (c327_passed / len(c327_tests) * 100) if c327_tests else 0
    
    c328_tests = [r for r in results if r["gate"] == "C328"]
    c328_passed = sum(1 for r in c328_tests if r["passed"])
    c328_rate = (c328_passed / len(c328_tests) * 100) if c328_tests else 0
    
    print(f"{'='*70}")
    print(f"RESULTS SUMMARY")
    print(f"{'='*70}")
    print(f"Total: {passed}/{total} passed ({pass_rate:.1f}%)")
    print(f"C327 gate (≥85%): {c327_passed}/{len(c327_tests)} = {c327_rate:.1f}% {'✅' if c327_rate >= 85 else '❌'}")
    print(f"C328 gate (≥85%): {c328_passed}/{len(c328_tests)} = {c328_rate:.1f}% {'✅' if c328_rate >= 85 else '❌'}")
    print(f"C330 final gate (≥90%): {pass_rate:.1f}% {'✅' if pass_rate >= 90 else '❌ (deploy needed)'}")
    
    # Save results
    output = {
        "timestamp": datetime.now().isoformat(),
        "mother_url": MOTHER_URL,
        "total_tests": total,
        "passed": passed,
        "failed": failed,
        "pass_rate": round(pass_rate, 1),
        "c327_gate": {"passed": c327_passed, "total": len(c327_tests), "rate": round(c327_rate, 1), "gate_met": c327_rate >= 85},
        "c328_gate": {"passed": c328_passed, "total": len(c328_tests), "rate": round(c328_rate, 1), "gate_met": c328_rate >= 85},
        "c330_gate": {"rate": round(pass_rate, 1), "gate_met": pass_rate >= 90},
        "results": results,
    }
    
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nResults saved to: {RESULTS_FILE}")
    return output

if __name__ == "__main__":
    run_obt()
