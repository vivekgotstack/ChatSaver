package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Map;

public final class IntegrationModels {

    private IntegrationModels() {
    }

    public record IntegrationDefinition(
            String slug,
            String name,
            String category,
            String description,
            List<String> capabilities,
            List<IntegrationAction> actions,
            boolean configured) {
    }

    public record IntegrationAction(
            String id,
            String label,
            String description,
            boolean readOnly) {
    }

    public record IntegrationConnection(
            String id,
            String toolkit,
            String status,
            String alias,
            String connectedAt,
            String updatedAt) {
    }

    public record ConnectLink(
            String redirectUrl,
            String connectionId,
            String expiresAt) {
    }

    public record CompletedConnection(
            String connectionId,
            String toolkit) {
    }

    public record ToolExecutionResult(
            String action,
            boolean successful,
            Map<String, Object> result) {
    }
}
