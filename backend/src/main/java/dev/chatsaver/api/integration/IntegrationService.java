package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import dev.chatsaver.api.integration.IntegrationModels.CompletedConnection;
import dev.chatsaver.api.integration.IntegrationModels.ConnectLink;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationConnection;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationDefinition;
import dev.chatsaver.api.integration.IntegrationModels.ToolExecutionResult;

@Service
class IntegrationService {

    private final IntegrationProvider provider;
    private final IntegrationCatalog catalog;
    private final IntegrationRateLimiter rateLimiter;

    IntegrationService(
            IntegrationProvider provider,
            IntegrationCatalog catalog,
            IntegrationRateLimiter rateLimiter) {
        this.provider = provider;
        this.catalog = catalog;
        this.rateLimiter = rateLimiter;
    }

    List<IntegrationDefinition> listIntegrations(UUID userId) {
        rateLimiter.check(userId, "catalog", 60);
        return catalog.definitions(provider.isConfigured());
    }

    List<IntegrationConnection> listConnections(UUID userId) {
        rateLimiter.check(userId, "connections", 60);
        return provider.listConnections(userId).stream()
                .filter(connection -> catalog.contains(connection.toolkit()))
                .toList();
    }

    ConnectLink connect(UUID userId, String toolkit) {
        String slug = catalog.requireToolkit(toolkit).slug();
        rateLimiter.check(userId, "connect", 10);
        return provider.createConnectLink(userId, slug);
    }

    CompletedConnection completeAuthentication(UUID userId, String sessionUri) {
        rateLimiter.check(userId, "complete", 10);
        if (sessionUri == null || sessionUri.isBlank()) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "The connection session is missing.");
        }
        CompletedConnection completed = provider.completeAuthentication(userId, sessionUri.trim());
        catalog.requireToolkit(completed.toolkit());
        return completed;
    }

    void disconnect(UUID userId, String connectionId) {
        rateLimiter.check(userId, "disconnect", 10);
        provider.disconnect(userId, connectionId);
    }

    ToolExecutionResult execute(
            UUID userId,
            String connectionId,
            String action,
            Map<String, Object> input) {
        rateLimiter.check(userId, "execute", 10);
        catalog.requireAction(action);
        if (input != null && !input.isEmpty()) {
            throw new IntegrationException(
                    HttpStatus.BAD_REQUEST,
                    "This read-only action does not accept input.");
        }
        return provider.execute(userId, connectionId, action, Map.of());
    }
}
