#!/usr/bin/env python3
"""
PDF Text Processor - Isolated Process for Chunking and Embeddings

This script runs as a separate process to isolate memory-intensive operations
from the Node.js event loop. It receives text via stdin, performs chunking
using tiktoken, generates embeddings via OpenAI API, and outputs JSON to stdout.

Input (stdin): JSON object with {"text": "...", "apiKey": "..."}
Output (stdout): JSON array of chunks with embeddings

Memory Safety: Process terminates after each request, ensuring no memory leaks.
"""

import sys
import json
import os
from typing import List, Dict, Any

try:
    import tiktoken
    from openai import OpenAI
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Install with: pip install tiktoken openai"}), file=sys.stderr)
    sys.exit(1)

# Configuration
CHUNK_SIZE = 1000  # tokens per chunk
CHUNK_OVERLAP = 200  # token overlap between chunks
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536

def chunk_text(text: str, encoding_name: str = "cl100k_base") -> List[Dict[str, Any]]:
    """
    Chunk text into overlapping segments using tiktoken.
    
    Args:
        text: Input text to chunk
        encoding_name: Tiktoken encoding name (default: cl100k_base for GPT-4)
    
    Returns:
        List of chunks with metadata (text, tokens, position)
    """
    try:
        encoding = tiktoken.get_encoding(encoding_name)
        tokens = encoding.encode(text)
        total_tokens = len(tokens)
        
        chunks = []
        position = 0
        
        while position < total_tokens:
            # Extract chunk with overlap
            chunk_end = min(position + CHUNK_SIZE, total_tokens)
            chunk_tokens = tokens[position:chunk_end]
            chunk_text = encoding.decode(chunk_tokens)
            
            chunks.append({
                "text": chunk_text,
                "tokens": len(chunk_tokens),
                "position": position,
                "total_tokens": total_tokens
            })
            
            # Move position forward (with overlap)
            position += CHUNK_SIZE - CHUNK_OVERLAP
            
            # Prevent infinite loop
            if position >= total_tokens:
                break
        
        return chunks
    
    except Exception as e:
        raise RuntimeError(f"Chunking failed: {e}")

def generate_embeddings(chunks: List[Dict[str, Any]], api_key: str) -> List[Dict[str, Any]]:
    """
    Generate embeddings for chunks using OpenAI API.
    
    Args:
        chunks: List of chunks with text
        api_key: OpenAI API key
    
    Returns:
        List of chunks with embeddings added
    """
    try:
        client = OpenAI(api_key=api_key)
        
        # Extract texts for batch embedding
        texts = [chunk["text"] for chunk in chunks]
        
        # Call OpenAI Embeddings API (batch)
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts,
            dimensions=EMBEDDING_DIMENSION
        )
        
        # Add embeddings to chunks
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = response.data[i].embedding
        
        return chunks
    
    except Exception as e:
        raise RuntimeError(f"Embedding generation failed: {e}")

def main():
    """
    Main entry point: read stdin, process text, write stdout.
    """
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        request = json.loads(input_data)
        
        # Validate input
        if "text" not in request or "apiKey" not in request:
            raise ValueError("Input must contain 'text' and 'apiKey' fields")
        
        text = request["text"]
        api_key = request["apiKey"]
        
        # Step 1: Chunk text
        chunks = chunk_text(text)
        
        # Step 2: Generate embeddings
        chunks_with_embeddings = generate_embeddings(chunks, api_key)
        
        # Step 3: Output JSON to stdout
        output = {
            "success": True,
            "chunks": chunks_with_embeddings,
            "total_chunks": len(chunks_with_embeddings),
            "total_tokens": sum(c["tokens"] for c in chunks_with_embeddings)
        }
        
        print(json.dumps(output))
        sys.exit(0)
    
    except Exception as e:
        # Error output to stdout (Node.js will parse this)
        error_output = {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    main()
