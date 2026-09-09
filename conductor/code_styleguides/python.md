# Python Style Guide

Keep image helpers small and explicit. Validate untrusted payloads before
mutation, use allowlists for executable and environment data, and return
sanitized errors. Cover both allowed and denied payloads with deterministic
tests.
