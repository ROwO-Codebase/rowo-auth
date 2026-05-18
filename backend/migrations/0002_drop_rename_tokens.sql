-- Apply AFTER deploying the worker that has stopped referencing rename_tokens.
DROP TABLE IF EXISTS rename_tokens;
