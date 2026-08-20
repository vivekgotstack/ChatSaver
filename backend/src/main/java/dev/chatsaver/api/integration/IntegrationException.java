package dev.chatsaver.api.integration;

import org.springframework.http.HttpStatus;

public final class IntegrationException extends RuntimeException {

    private final HttpStatus status;

    public IntegrationException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
