package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import dev.chatsaver.api.integration.IntegrationModels.CompletedConnection;
import dev.chatsaver.api.integration.IntegrationModels.ConnectLink;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationConnection;
import dev.chatsaver.api.integration.IntegrationModels.ToolExecutionResult;

public interface IntegrationProvider {

    boolean isConfigured();

    List<IntegrationConnection> listConnections(UUID userId);

    ConnectLink createConnectLink(UUID userId, String toolkit);

    CompletedConnection completeAuthentication(UUID userId, String sessionUri);

    void disconnect(UUID userId, String connectionId);

    ToolExecutionResult execute(
            UUID userId,
            String connectionId,
            String action,
            Map<String, Object> input);
}
