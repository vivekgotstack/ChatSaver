package dev.chatsaver.api.integration;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.JsonNode;

import dev.chatsaver.api.integration.IntegrationModels.CompletedConnection;
import dev.chatsaver.api.integration.IntegrationModels.ConnectLink;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationConnection;
import dev.chatsaver.api.integration.IntegrationModels.ToolExecutionResult;

@Component
public final class ComposioIntegrationProvider implements IntegrationProvider {

    private static final Pattern CONNECTION_ID = Pattern.compile("[A-Za-z0-9_-]{4,128}");
    private static final Duration AUTH_CONFIG_CACHE_TTL = Duration.ofMinutes(15);
    private static final String GITHUB_PROFILE_ACTION = "verify-profile";
    private static final String GITHUB_PROFILE_TOOL = "GITHUB_GET_THE_AUTHENTICATED_USER";

    private final RestClient client;
    private final String apiKey;
    private final String callbackUrl;
    private final String githubVersion;
    private final ConcurrentHashMap<String, CachedAuthConfig> authConfigs = new ConcurrentHashMap<>();

    public ComposioIntegrationProvider(
            @Value("${chatsaver.integrations.composio.api-key:}") String apiKey,
            @Value("${chatsaver.integrations.composio.api-base-url:https://backend.composio.dev/api}") String apiBaseUrl,
            @Value("${chatsaver.integrations.composio.callback-url:}") String configuredCallbackUrl,
            @Value("${chatsaver.web-origin:http://localhost:3000}") String webOrigin,
            @Value("${chatsaver.integrations.composio.github-version:20260721_00}") String githubVersion) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.callbackUrl = configuredCallbackUrl == null || configuredCallbackUrl.isBlank()
                ? stripTrailingSlash(webOrigin) + "/integrations/callback"
                : configuredCallbackUrl.trim();
        this.githubVersion = githubVersion.trim();

        RestClient.Builder configuredBuilder = RestClient.builder()
                .baseUrl(stripTrailingSlash(apiBaseUrl));
        if (!this.apiKey.isBlank()) {
            configuredBuilder.defaultHeader("x-api-key", this.apiKey);
        }
        this.client = configuredBuilder.build();
    }

    @Override
    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    @Override
    public List<IntegrationConnection> listConnections(UUID userId) {
        requireConfigured();
        JsonNode response = call(() -> client.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/v3.1/connected_accounts")
                        .queryParam("user_ids", userId.toString())
                        .queryParam("limit", 100)
                        .build())
                .retrieve()
                .body(JsonNode.class));

        List<IntegrationConnection> connections = new ArrayList<>();
        JsonNode items = response == null ? null : response.path("items");
        if (items == null || !items.isArray()) return List.of();
        for (JsonNode item : items) {
            if (!userId.toString().equals(text(item, "user_id"))) continue;
            IntegrationConnection connection = toConnection(item);
            if (connection != null) connections.add(connection);
        }
        return List.copyOf(connections);
    }

    @Override
    public ConnectLink createConnectLink(UUID userId, String toolkit) {
        requireConfigured();
        String authConfigId = managedAuthConfig(toolkit);
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("auth_config_id", authConfigId);
        request.put("user_id", userId.toString());
        request.put("callback_url", callbackUrl);

        JsonNode response = call(() -> client.post()
                .uri("/v3/connected_accounts/link")
                .body(request)
                .retrieve()
                .body(JsonNode.class));
        String redirectUrl = requiredText(response, "redirect_url", "The provider did not return a connect link.");
        validateRedirectUrl(redirectUrl);
        return new ConnectLink(
                redirectUrl,
                text(response, "connected_account_id"),
                text(response, "expires_at"));
    }

    @Override
    public CompletedConnection completeAuthentication(UUID userId, String sessionUri) {
        requireConfigured();
        JsonNode response = call(() -> client.post()
                .uri("/v3.1/connected_accounts/complete_auth")
                .body(Map.of(
                        "session_uri", sessionUri,
                        "user_id", userId.toString()))
                .retrieve()
                .body(JsonNode.class));
        return new CompletedConnection(
                requiredText(response, "connected_account_id", "The provider did not confirm the connection."),
                requiredText(response, "toolkit_slug", "The provider did not identify the integration."));
    }

    @Override
    public void disconnect(UUID userId, String connectionId) {
        IntegrationConnection owned = requireOwnedConnection(userId, connectionId);
        call(() -> {
            client.delete()
                    .uri("/v3.1/connected_accounts/{connectionId}", owned.id())
                    .retrieve()
                    .toBodilessEntity();
            return null;
        });
    }

    @Override
    public ToolExecutionResult execute(
            UUID userId,
            String connectionId,
            String action,
            Map<String, Object> input) {
        IntegrationConnection owned = requireOwnedConnection(userId, connectionId);
        if (!"github".equals(owned.toolkit()) || !GITHUB_PROFILE_ACTION.equals(action)) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "That integration action is not allowed.");
        }

        JsonNode response = call(() -> client.post()
                .uri("/v3.1/tools/execute/{tool}", GITHUB_PROFILE_TOOL)
                .body(Map.of(
                        "connected_account_id", owned.id(),
                        "user_id", userId.toString(),
                        "version", githubVersion,
                        "arguments", Map.of()))
                .retrieve()
                .body(JsonNode.class));
        if (response == null || !response.path("successful").asBoolean(false)) {
            throw new IntegrationException(
                    HttpStatus.BAD_GATEWAY,
                    "GitHub did not complete the read-only connection check.");
        }

        JsonNode profile = response.path("data");
        if (profile.path("data").isObject()) profile = profile.path("data");
        Map<String, Object> safeProfile = new LinkedHashMap<>();
        copyText(profile, safeProfile, "login");
        copyText(profile, safeProfile, "name");
        copyText(profile, safeProfile, "html_url");
        copyNumber(profile, safeProfile, "public_repos");
        return new ToolExecutionResult(action, true, Map.copyOf(safeProfile));
    }

    private IntegrationConnection requireOwnedConnection(UUID userId, String connectionId) {
        requireConfigured();
        if (connectionId == null || !CONNECTION_ID.matcher(connectionId).matches()) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "Integration connection was not found.");
        }
        JsonNode response = call(() -> client.get()
                .uri("/v3.1/connected_accounts/{connectionId}", connectionId)
                .retrieve()
                .body(JsonNode.class));
        if (response == null || !userId.toString().equals(text(response, "user_id"))) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "Integration connection was not found.");
        }
        IntegrationConnection connection = toConnection(response);
        if (connection == null) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "Integration connection was not found.");
        }
        return connection;
    }

    private String managedAuthConfig(String toolkit) {
        long now = System.currentTimeMillis();
        CachedAuthConfig cached = authConfigs.get(toolkit);
        if (cached != null && now < cached.expiresAt) return cached.id;

        JsonNode response = call(() -> client.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/v3/auth_configs")
                        .queryParam("toolkit_slug", toolkit)
                        .queryParam("is_composio_managed", true)
                        .queryParam("show_disabled", false)
                        .queryParam("limit", 50)
                        .build())
                .retrieve()
                .body(JsonNode.class));
        JsonNode items = response == null ? null : response.path("items");
        if (items != null && items.isArray()) {
            for (JsonNode item : items) {
                if (!item.path("is_composio_managed").asBoolean(false)) continue;
                if (!"ENABLED".equalsIgnoreCase(text(item, "status"))) continue;
                if (!toolkit.equalsIgnoreCase(item.path("toolkit").path("slug").asText())) continue;
                String id = text(item, "id");
                if (id != null && !id.isBlank()) {
                    authConfigs.put(toolkit, new CachedAuthConfig(
                            id,
                            now + AUTH_CONFIG_CACHE_TTL.toMillis()));
                    return id;
                }
            }
        }
        throw new IntegrationException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "This integration is not enabled in the Composio project yet.");
    }

    private IntegrationConnection toConnection(JsonNode item) {
        String id = text(item, "id");
        String toolkit = item.path("toolkit").path("slug").asText().toLowerCase(Locale.ROOT);
        String status = text(item, "status");
        if (id == null || id.isBlank() || toolkit.isBlank()) return null;
        return new IntegrationConnection(
                id,
                toolkit,
                status == null ? "UNKNOWN" : status.toUpperCase(Locale.ROOT),
                text(item, "alias"),
                text(item, "created_at"),
                text(item, "updated_at"));
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IntegrationException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Integrations are not configured on this server yet.");
        }
    }

    private <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (IntegrationException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            if (status == 404) {
                throw new IntegrationException(HttpStatus.NOT_FOUND, "Integration connection was not found.");
            }
            if (status == 429) {
                throw new IntegrationException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "The integration provider usage limit was reached. Try again shortly.");
            }
            if (status == 401 || status == 403) {
                throw new IntegrationException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "The integration provider rejected the server configuration.");
            }
            throw new IntegrationException(
                    HttpStatus.BAD_GATEWAY,
                    "The integration provider could not complete that request.");
        } catch (ResourceAccessException exception) {
            throw new IntegrationException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "The integration provider is temporarily unreachable.");
        } catch (RestClientException exception) {
            throw new IntegrationException(
                    HttpStatus.BAD_GATEWAY,
                    "The integration provider returned an invalid response.");
        }
    }

    private static void validateRedirectUrl(String redirectUrl) {
        URI uri;
        try {
            uri = URI.create(redirectUrl);
        } catch (IllegalArgumentException exception) {
            throw new IntegrationException(HttpStatus.BAD_GATEWAY, "The provider returned an invalid connect link.");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            throw new IntegrationException(HttpStatus.BAD_GATEWAY, "The provider returned an invalid connect link.");
        }
    }

    private static String requiredText(JsonNode node, String field, String message) {
        String value = text(node, field);
        if (value == null || value.isBlank()) {
            throw new IntegrationException(HttpStatus.BAD_GATEWAY, message);
        }
        return value;
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        String value = node.path(field).asText();
        return value.isBlank() ? null : value;
    }

    private static void copyText(JsonNode source, Map<String, Object> target, String field) {
        String value = text(source, field);
        if (value != null) target.put(field, value);
    }

    private static void copyNumber(JsonNode source, Map<String, Object> target, String field) {
        JsonNode value = source.path(field);
        if (value.isIntegralNumber()) target.put(field, value.longValue());
    }

    private static String stripTrailingSlash(String value) {
        if (value == null) return "";
        return value.trim().replaceFirst("/+$", "");
    }

    private record CachedAuthConfig(String id, long expiresAt) {
    }
}
