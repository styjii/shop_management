from rest_framework.views import exception_handler

# SimpleJWT error codes whose default messages are not translated.
JWT_MESSAGES = {
    "token_not_valid": "Jeton invalide ou expiré.",
}


def api_exception_handler(exc, context):
    """DRF exception handler that returns French messages for JWT errors."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict):
        message = JWT_MESSAGES.get(response.data.get("code"))
        if message:
            response.data = {"detail": message, "code": response.data["code"]}
    return response
