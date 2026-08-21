package dev.chatsaver.api.integration;

import java.net.URI;

import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import dev.chatsaver.api.error.RequestAttributes;
import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
class IntegrationExceptionHandler {

    @ExceptionHandler(IntegrationException.class)
    ProblemDetail handle(IntegrationException exception, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
        problem.setTitle("Integration request failed");
        problem.setType(URI.create("https://chatsaver.dev/problems/integration"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("requestId", request.getAttribute(RequestAttributes.REQUEST_ID));
        return problem;
    }
}
