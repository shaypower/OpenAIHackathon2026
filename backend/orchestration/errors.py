class WorkflowError(Exception):
    """An explicit, public-safe workflow failure."""

    def __init__(self, status_code, code, message, *, retryable=False, details=None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details or {}
