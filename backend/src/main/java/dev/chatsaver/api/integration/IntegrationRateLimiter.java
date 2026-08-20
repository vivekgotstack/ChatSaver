package dev.chatsaver.api.integration;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
class IntegrationRateLimiter {

    private static final long WINDOW_MILLIS = Duration.ofMinutes(1).toMillis();
    private final ConcurrentHashMap<RateKey, Window> windows = new ConcurrentHashMap<>();

    void check(UUID userId, String scope, int limit) {
        long now = System.currentTimeMillis();
        Window window = windows.compute(new RateKey(userId, scope), (key, current) -> {
            if (current == null || now - current.startedAt >= WINDOW_MILLIS) {
                return new Window(now, 1);
            }
            return new Window(current.startedAt, current.requests + 1);
        });
        if (window.requests > limit) {
            throw new IntegrationException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Too many integration requests. Try again in a minute.");
        }
    }

    private record RateKey(UUID userId, String scope) {
    }

    private record Window(long startedAt, int requests) {
    }
}
