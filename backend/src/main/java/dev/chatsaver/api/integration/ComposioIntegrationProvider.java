package dev.chatsaver.api.integration;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
public class ComposioIntegrationProvider implements IntegrationProvider {

    private static final Pattern CONNECTION_ID = Pattern.compile("[A-Za-z0-9_-]{4,128}");
    private static final Duration AUTH_CONFIG_CACHE_TTL = Duration.ofMinutes(15);
    private static final String CONNECTED_ACCOUNTS_PATH = "/v3.1/connected_accounts";
    private static final String AUTH_CONFIGS_PATH = "/v3.1/auth_configs";
    private static final int MAX_RESULTS = 12;
    private static final int MAX_CONTENT_LENGTH = 500_000;
    private static final Set<String> SEARCH_ACTIONS = Set.of(
            "gmail-search", "drive-search", "notion-search", "slack-search");
    private static final Pattern LINKEDIN_POST_URN = Pattern.compile(
            "urn:li:(?:activity|share|ugcPost):[A-Za-z0-9_-]{4,128}", Pattern.CASE_INSENSITIVE);
    private static final Pattern LINKEDIN_ACTIVITY_ID = Pattern.compile(
            "(?:activity|share|ugcPost)[-:](\\d{4,32})", Pattern.CASE_INSENSITIVE);

    private final RestClient client;
    private final String apiKey;
    private final String callbackUrl;
    private final Map<String, String> toolkitVersions;
    private final ConcurrentHashMap<String, CachedAuthConfig> authConfigs = new ConcurrentHashMap<>();

    public ComposioIntegrationProvider(
            @Value("${chatsaver.integrations.composio.api-key:}") String apiKey,
            @Value("${chatsaver.integrations.composio.api-base-url:https://backend.composio.dev/api}") String apiBaseUrl,
            @Value("${chatsaver.integrations.composio.callback-url:}") String configuredCallbackUrl,
            @Value("${chatsaver.web-origin:http://localhost:3000}") String webOrigin,
            @Value("${chatsaver.integrations.composio.gmail-version:20260817_00}") String gmailVersion,
            @Value("${chatsaver.integrations.composio.googledrive-version:20260721_00}") String googleDriveVersion,
            @Value("${chatsaver.integrations.composio.github-version:20260721_00}") String githubVersion,
            @Value("${chatsaver.integrations.composio.notion-version:20260730_00}") String notionVersion,
            @Value("${chatsaver.integrations.composio.slack-version:20260721_00}") String slackVersion,
            @Value("${chatsaver.integrations.composio.linkedin-version:20260724_00}") String linkedinVersion) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.callbackUrl = configuredCallbackUrl == null || configuredCallbackUrl.isBlank()
                ? stripTrailingSlash(webOrigin) + "/integrations/callback"
                : configuredCallbackUrl.trim();
        this.toolkitVersions = Map.of(
                "gmail", gmailVersion.trim(),
                "googledrive", googleDriveVersion.trim(),
                "github", githubVersion.trim(),
                "notion", notionVersion.trim(),
                "slack", slackVersion.trim(),
                "linkedin", linkedinVersion.trim());

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
        JsonNode response;
        try {
            response = call(() -> client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path(CONNECTED_ACCOUNTS_PATH)
                            .queryParam("user_ids", userId.toString())
                            .queryParam("limit", 100)
                            .build())
                    .retrieve()
                    .body(JsonNode.class));
        } catch (IntegrationException exception) {
            if (exception.status() == HttpStatus.NOT_FOUND) return List.of();
            throw exception;
        }

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
                .uri(CONNECTED_ACCOUNTS_PATH + "/link")
                .body(request)
                .retrieve()
                .body(JsonNode.class),
                "This integration is not enabled in the Composio project yet.");
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
                .uri(CONNECTED_ACCOUNTS_PATH + "/complete_auth")
                .body(Map.of(
                        "session_uri", sessionUri,
                        "user_id", userId.toString()))
                .retrieve()
                .body(JsonNode.class),
                "The authorization session expired. Start the connection again.");
        return new CompletedConnection(
                requiredText(response, "connected_account_id", "The provider did not confirm the connection."),
                requiredText(response, "toolkit_slug", "The provider did not identify the integration."));
    }

    @Override
    public void disconnect(UUID userId, String connectionId) {
        IntegrationConnection owned = requireOwnedConnection(userId, connectionId);
        call(() -> {
            client.delete()
                    .uri(CONNECTED_ACCOUNTS_PATH + "/{connectionId}", owned.id())
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
        ToolRequest request = toolRequest(owned.toolkit(), action, input);
        JsonNode data = executeTool(userId, owned, request);
        Map<String, Object> safeResult = SEARCH_ACTIONS.contains(action)
                ? normalizeSearch(owned.toolkit(), data)
                : normalizeDocument(owned.toolkit(), data, request.fallbackTitle());
        return new ToolExecutionResult(action, true, safeResult);
    }

    private ToolRequest toolRequest(String toolkit, String action, Map<String, Object> input) {
        String query;
        return switch (toolkit + ":" + action) {
            case "gmail:gmail-search" -> new ToolRequest(
                    "GMAIL_FETCH_EMAILS",
                    Map.of("query", requiredInput(input, "query", 300),
                            "max_results", MAX_RESULTS,
                            "include_payload", true,
                            "user_id", "me"),
                    "Gmail email");
            case "gmail:gmail-import-message" -> new ToolRequest(
                    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
                    Map.of("message_id", requiredInput(input, "messageId", 256), "user_id", "me"),
                    optionalInput(input, "title", 160, "Gmail email"));
            case "gmail:gmail-import-thread" -> new ToolRequest(
                    "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
                    Map.of("thread_id", requiredInput(input, "threadId", 256), "user_id", "me"),
                    optionalInput(input, "title", 160, "Gmail thread"));
            case "googledrive:drive-search" -> {
                query = requiredInput(input, "query", 200).replace("\\", "\\\\").replace("'", "\\'");
                yield new ToolRequest(
                        "GOOGLEDRIVE_FIND_FILE",
                        Map.of("q", "name contains '" + query + "' and trashed = false"),
                        "Google Drive file");
            }
            case "googledrive:drive-import" -> new ToolRequest(
                    "GOOGLEDRIVE_PARSE_FILE",
                    Map.of("file_id", requiredInput(input, "fileId", 256)),
                    optionalInput(input, "title", 160, "Google Drive file"));
            case "notion:notion-search" -> new ToolRequest(
                    "NOTION_SEARCH_NOTION_PAGE",
                    Map.of("query", requiredInput(input, "query", 200), "page_size", MAX_RESULTS),
                    "Notion page");
            case "notion:notion-import" -> new ToolRequest(
                    "NOTION_GET_PAGE_MARKDOWN",
                    Map.of("page_id", requiredInput(input, "pageId", 256)),
                    optionalInput(input, "title", 160, "Notion page"));
            case "slack:slack-search" -> new ToolRequest(
                    "SLACK_SEARCH_MESSAGES",
                    Map.of("query", requiredInput(input, "query", 300)),
                    "Slack message");
            case "slack:slack-import-thread" -> new ToolRequest(
                    "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
                    Map.of(
                            "channel", requiredInput(input, "channel", 256),
                            "ts", requiredInput(input, "threadTs", 64)),
                    optionalInput(input, "title", 160, "Slack thread"));
            case "github:github-import" -> githubRequest(requiredInput(input, "url", 2048));
            case "linkedin:linkedin-import-profile" -> new ToolRequest(
                    "LINKEDIN_GET_MY_INFO", Map.of(), "LinkedIn profile");
            case "linkedin:linkedin-import-post" -> new ToolRequest(
                    "LINKEDIN_GET_POST_CONTENT",
                    Map.of("post_id", linkedinPostId(requiredInput(input, "url", 2048))),
                    "LinkedIn post");
            default -> throw new IntegrationException(HttpStatus.BAD_REQUEST, "That integration action is not allowed.");
        };
    }

    private ToolRequest githubRequest(String rawUrl) {
        URI url;
        try {
            url = URI.create(rawUrl);
        } catch (IllegalArgumentException exception) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "Enter a valid GitHub URL.");
        }
        if (!"https".equalsIgnoreCase(url.getScheme())
                || !("github.com".equalsIgnoreCase(url.getHost()) || "www.github.com".equalsIgnoreCase(url.getHost()))) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "Only https://github.com URLs can be imported.");
        }
        String[] parts = url.getPath().replaceFirst("^/+", "").split("/");
        if (parts.length < 2 || !parts[0].matches("[A-Za-z0-9_.-]{1,100}")
                || !parts[1].matches("[A-Za-z0-9_.-]{1,100}")) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "Enter a repository, README, issue, pull request, or discussion URL.");
        }
        String owner = parts[0];
        String repo = parts[1].replaceFirst("\\.git$", "");
        String fallback = owner + "/" + repo;
        if (parts.length >= 4 && "issues".equals(parts[2])) {
            return new ToolRequest("GITHUB_GET_AN_ISSUE", Map.of(
                    "owner", owner, "repo", repo, "issue_number", positiveNumber(parts[3])), fallback + " issue");
        }
        if (parts.length >= 4 && "pull".equals(parts[2])) {
            return new ToolRequest("GITHUB_GET_A_PULL_REQUEST", Map.of(
                    "owner", owner, "repo", repo, "pull_number", positiveNumber(parts[3])), fallback + " pull request");
        }
        if (parts.length >= 4 && "discussions".equals(parts[2])) {
            return new ToolRequest("GITHUB_GET_DISCUSSION", Map.of(
                    "owner", owner, "repo", repo, "discussion_number", positiveNumber(parts[3])), fallback + " discussion");
        }
        return new ToolRequest("GITHUB_GET_A_REPOSITORY_README", Map.of("owner", owner, "repo", repo), fallback + " README");
    }

    private static String linkedinPostId(String rawValue) {
        String value = rawValue.trim();
        if (LINKEDIN_POST_URN.matcher(value).matches()) return value;
        if (value.matches("\\d{4,32}")) return "urn:li:activity:" + value;

        URI url;
        try {
            url = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "Enter a valid LinkedIn post URL or URN.");
        }
        String host = url.getHost();
        if (!"https".equalsIgnoreCase(url.getScheme())
                || host == null
                || !(host.equalsIgnoreCase("linkedin.com") || host.toLowerCase(Locale.ROOT).endsWith(".linkedin.com"))) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "Only LinkedIn post URLs or URNs can be imported.");
        }
        java.util.regex.Matcher matcher = LINKEDIN_ACTIVITY_ID.matcher(url.toString());
        if (matcher.find()) return "urn:li:activity:" + matcher.group(1);
        throw new IntegrationException(
                HttpStatus.BAD_REQUEST,
                "That LinkedIn URL does not contain a supported post activity ID.");
    }

    private JsonNode executeTool(UUID userId, IntegrationConnection connection, ToolRequest request) {
        String version = toolkitVersions.get(connection.toolkit());
        if (version == null || version.isBlank()) {
            throw new IntegrationException(HttpStatus.SERVICE_UNAVAILABLE, "This integration version is not configured.");
        }
        JsonNode response = call(() -> client.post()
                .uri("/v3.1/tools/execute/{tool}", request.tool())
                .body(Map.of(
                        "connected_account_id", connection.id(),
                        "user_id", userId.toString(),
                        "version", version,
                        "arguments", request.arguments()))
                .retrieve()
                .body(JsonNode.class));
        if (response == null || !response.path("successful").asBoolean(false)) {
            throw new IntegrationException(HttpStatus.BAD_GATEWAY, "The connected service could not complete that read-only action.");
        }
        JsonNode data = response.path("data");
        if (data.path("data").isObject() || data.path("data").isArray()) data = data.path("data");
        return data;
    }

    private Map<String, Object> normalizeSearch(String toolkit, JsonNode data) {
        JsonNode candidates = firstArray(data, switch (toolkit) {
            case "gmail" -> List.of("messages", "emails", "threads");
            case "googledrive" -> List.of("files", "items");
            case "notion" -> List.of("results", "pages");
            case "slack" -> List.of("matches", "messages", "results");
            default -> List.of("items", "results");
        }, 0);
        List<Map<String, Object>> items = new ArrayList<>();
        if (candidates != null) {
            for (JsonNode candidate : candidates) {
                Map<String, Object> item = normalizeSearchItem(toolkit, candidate);
                if (!item.isEmpty()) items.add(item);
                if (items.size() == MAX_RESULTS) break;
            }
        }
        return Map.of("items", List.copyOf(items));
    }

    private Map<String, Object> normalizeSearchItem(String toolkit, JsonNode item) {
        Map<String, Object> reference = new LinkedHashMap<>();
        String title;
        String subtitle;
        String preview;
        switch (toolkit) {
            case "gmail" -> {
                putFirst(reference, "messageId", item, "messageId", "message_id", "id");
                putFirst(reference, "threadId", item, "threadId", "thread_id");
                title = firstText(item, "subject", "title");
                subtitle = firstText(item, "sender", "from", "date");
                preview = firstText(item, "snippet", "messageText", "body", "text");
            }
            case "googledrive" -> {
                putFirst(reference, "fileId", item, "fileId", "file_id", "id");
                title = firstText(item, "name", "title");
                subtitle = firstText(item, "mimeType", "mime_type", "modifiedTime");
                preview = firstText(item, "description", "webViewLink");
            }
            case "notion" -> {
                putFirst(reference, "pageId", item, "pageId", "page_id", "id");
                title = firstText(item, "title", "name", "plain_text");
                subtitle = firstText(item, "object", "last_edited_time");
                preview = firstText(item, "description", "url");
            }
            case "slack" -> {
                putFirst(reference, "channel", item, "channel_id", "channel");
                putFirst(reference, "threadTs", item, "thread_ts", "ts", "timestamp");
                title = firstText(item, "channel_name", "username", "user_name");
                subtitle = firstText(item, "username", "user_name", "channel_name");
                preview = firstText(item, "text", "message", "content");
            }
            default -> throw new IntegrationException(HttpStatus.BAD_GATEWAY, "The connected service returned unsupported results.");
        }
        if (reference.isEmpty()) return Map.of();
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", reference.values().iterator().next());
        safe.put("title", limited(title, 160, "Untitled result"));
        if (subtitle != null) safe.put("subtitle", limited(subtitle, 180, ""));
        if (preview != null) safe.put("preview", limited(preview, 320, ""));
        safe.put("reference", Map.copyOf(reference));
        return Map.copyOf(safe);
    }

    private Map<String, Object> normalizeDocument(String toolkit, JsonNode data, String fallbackTitle) {
        String title = firstText(data, "subject", "title", "name", "filename");
        String content = switch (toolkit) {
            case "gmail" -> renderEmail(data);
            case "slack" -> renderSlack(data);
            case "linkedin" -> renderLinkedIn(data, fallbackTitle);
            default -> firstText(data, "markdown", "content", "messageText", "file_content", "body", "text");
        };
        if (content != null && "base64".equalsIgnoreCase(firstText(data, "encoding"))) {
            content = decodeBase64(content);
        }
        if (content == null || content.isBlank()) {
            content = data == null || data.isMissingNode() ? null : data.toString();
        }
        if (content == null || content.isBlank() || content.startsWith("http://") || content.startsWith("https://")) {
            throw new IntegrationException(HttpStatus.UNPROCESSABLE_ENTITY, "That item did not contain importable text.");
        }
        String sourceUrl = firstText(data, "html_url", "webViewLink", "permalink", "url");
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("title", limited(title, 160, fallbackTitle));
        document.put("content", limited(content, MAX_CONTENT_LENGTH, ""));
        document.put("sourceLabel", displayName(toolkit));
        if (sourceUrl != null && sourceUrl.startsWith("https://")) document.put("sourceUrl", limited(sourceUrl, 2048, ""));
        return Map.of("document", Map.copyOf(document));
    }

    private static String renderEmail(JsonNode data) {
        JsonNode messages = firstArray(data, List.of("messages", "emails"), 0);
        if (messages != null && messages.size() > 1) {
            StringBuilder thread = new StringBuilder();
            for (JsonNode message : messages) {
                if (!thread.isEmpty()) thread.append("\n\n---\n\n");
                appendMetadata(thread, "From", firstText(message, "sender", "from"));
                appendMetadata(thread, "To", firstText(message, "to", "recipient"));
                appendMetadata(thread, "Date", firstText(message, "date", "messageTimestamp"));
                String body = firstText(message, "messageText", "body", "text", "snippet");
                if (body != null) thread.append("\n").append(body);
            }
            return thread.toString().trim();
        }
        StringBuilder email = new StringBuilder();
        appendMetadata(email, "From", firstText(data, "sender", "from"));
        appendMetadata(email, "To", firstText(data, "to", "recipient"));
        appendMetadata(email, "Date", firstText(data, "date", "messageTimestamp"));
        String body = firstText(data, "messageText", "body", "text", "snippet");
        if (body != null) email.append("\n").append(body);
        return email.toString().trim();
    }

    private static String renderSlack(JsonNode data) {
        JsonNode messages = firstArray(data, List.of("messages", "replies"), 0);
        if (messages == null) return firstText(data, "text", "message", "content");
        StringBuilder markdown = new StringBuilder();
        for (JsonNode message : messages) {
            String author = firstText(message, "username", "user_name", "user");
            String text = firstText(message, "text", "message", "content");
            if (text == null) continue;
            if (!markdown.isEmpty()) markdown.append("\n\n");
            markdown.append("**").append(author == null ? "Slack" : author).append(":** ").append(text);
        }
        return markdown.toString();
    }

    private static String renderLinkedIn(JsonNode data, String fallbackTitle) {
        if (!fallbackTitle.toLowerCase(Locale.ROOT).contains("profile")) {
            return firstText(data, "commentary", "text", "content", "body");
        }
        String firstName = firstText(data, "localizedFirstName", "given_name", "first_name");
        String lastName = firstText(data, "localizedLastName", "family_name", "last_name");
        String fullName = firstText(data, "name", "formattedName");
        if (fullName == null) fullName = String.join(" ",
                firstName == null ? "" : firstName,
                lastName == null ? "" : lastName).trim();
        StringBuilder profile = new StringBuilder();
        if (!fullName.isBlank()) profile.append("# ").append(fullName).append("\n\n");
        appendMetadata(profile, "Headline", firstText(data, "headline", "localizedHeadline"));
        appendMetadata(profile, "Email", firstText(data, "email", "emailAddress"));
        appendMetadata(profile, "LinkedIn ID", firstText(data, "person_id", "sub", "id"));
        appendMetadata(profile, "Profile", firstText(data, "profile_url", "vanityName"));
        return profile.toString().trim();
    }

    private static JsonNode firstArray(JsonNode node, List<String> names, int depth) {
        if (node == null || depth > 8) return null;
        for (String name : names) {
            JsonNode direct = node.path(name);
            if (direct.isArray()) return direct;
        }
        if (node.isObject() || node.isArray()) {
            for (JsonNode child : node) {
                JsonNode found = firstArray(child, names, depth + 1);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String firstText(JsonNode node, String... names) {
        return firstText(node, List.of(names), 0);
    }

    private static String firstText(JsonNode node, List<String> names, int depth) {
        if (node == null || depth > 8) return null;
        for (String name : names) {
            JsonNode direct = node.path(name);
            if (direct.isTextual() && !direct.asText().isBlank()) return direct.asText().trim();
            if (direct.isNumber() || direct.isBoolean()) return direct.asText();
        }
        if (node.isObject() || node.isArray()) {
            for (JsonNode child : node) {
                String found = firstText(child, names, depth + 1);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static void putFirst(Map<String, Object> target, String targetName, JsonNode source, String... names) {
        String value = firstText(source, names);
        if (value != null) target.put(targetName, limited(value, 1024, ""));
    }

    private static void appendMetadata(StringBuilder target, String label, String value) {
        if (value != null) target.append("**").append(label).append(":** ").append(value).append("\n");
    }

    private static String requiredInput(Map<String, Object> input, String key, int maxLength) {
        Object raw = input.get(key);
        if (!(raw instanceof String value) || value.isBlank() || value.length() > maxLength) {
            throw new IntegrationException(HttpStatus.BAD_REQUEST, "The " + key + " value is required.");
        }
        return value.trim();
    }

    private static String optionalInput(Map<String, Object> input, String key, int maxLength, String fallback) {
        Object raw = input.get(key);
        return raw instanceof String value && !value.isBlank() && value.length() <= maxLength ? value.trim() : fallback;
    }

    private static int positiveNumber(String value) {
        try {
            int number = Integer.parseInt(value);
            if (number > 0) return number;
        } catch (NumberFormatException ignored) {
            // A single validation response is returned below.
        }
        throw new IntegrationException(HttpStatus.BAD_REQUEST, "The GitHub item number is invalid.");
    }

    private static String limited(String value, int maxLength, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        String clean = value.replace("\u0000", "").trim();
        return clean.length() <= maxLength ? clean : clean.substring(0, maxLength);
    }

    private static String decodeBase64(String value) {
        try {
            byte[] decoded = Base64.getMimeDecoder().decode(value);
            if (decoded.length > MAX_CONTENT_LENGTH) {
                throw new IntegrationException(HttpStatus.PAYLOAD_TOO_LARGE, "That document is too large to import safely.");
            }
            return new String(decoded, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException exception) {
            return value;
        }
    }

    private static String displayName(String toolkit) {
        return switch (toolkit) {
            case "gmail" -> "Gmail";
            case "googledrive" -> "Google Drive";
            case "github" -> "GitHub";
            case "notion" -> "Notion";
            case "slack" -> "Slack";
            case "linkedin" -> "LinkedIn";
            default -> "Integration";
        };
    }

    private IntegrationConnection requireOwnedConnection(UUID userId, String connectionId) {
        requireConfigured();
        if (connectionId == null || !CONNECTION_ID.matcher(connectionId).matches()) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "Integration connection was not found.");
        }
        JsonNode response = call(() -> client.get()
                .uri(CONNECTED_ACCOUNTS_PATH + "/{connectionId}", connectionId)
                .retrieve()
                .body(JsonNode.class),
                "Integration connection was not found.");
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
                        .path(AUTH_CONFIGS_PATH)
                        .queryParam("toolkit_slug", toolkit)
                        .queryParam("is_composio_managed", true)
                        .queryParam("show_disabled", false)
                        .queryParam("limit", 50)
                        .build())
                .retrieve()
                .body(JsonNode.class),
                "This integration is not enabled in the Composio project yet.");
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
        return call(request, "The requested integration resource was not found.");
    }

    private <T> T call(Supplier<T> request, String notFoundMessage) {
        try {
            return request.get();
        } catch (IntegrationException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            if (status == 404) {
                throw new IntegrationException(HttpStatus.NOT_FOUND, notFoundMessage);
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

    private record ToolRequest(String tool, Map<String, Object> arguments, String fallbackTitle) {
    }
}
