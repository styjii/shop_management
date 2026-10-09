from rest_framework.views import exception_handler

# SimpleJWT error codes whose default messages are not translated.
JWT_MESSAGES = {
    "token_not_valid": "Jeton invalide ou expiré.",
}


def api_exception_handler(exc, context):
    """DRF exception handler that returns French messages for JWT errors."""
    response = exception_handler(exc, context)
    if response is None or not isinstance(response.data, dict):
        return response

    code = response.data.get("code")
    if isinstance(code, str) and code in JWT_MESSAGES:
        response.data = {"detail": JWT_MESSAGES[code], "code": code}
    return response
