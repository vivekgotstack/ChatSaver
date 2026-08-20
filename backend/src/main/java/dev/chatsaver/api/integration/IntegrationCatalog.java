package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import dev.chatsaver.api.integration.IntegrationModels.IntegrationAction;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationDefinition;

@Component
public final class IntegrationCatalog {

    private static final IntegrationAction GITHUB_PROFILE = new IntegrationAction(
            "verify-profile",
            "Verify connection",
            "Read your public GitHub profile to confirm this connection.",
            true);

    private static final List<IntegrationDefinition> DEFINITIONS = List.of(
            definition(
                    "googledrive",
                    "Google Drive",
                    "Storage",
                    "Bring approved Drive workflows into your private workspace.",
                    List.of("Managed OAuth", "Connection management"),
                    List.of()),
            definition(
                    "gmail",
                    "Gmail",
                    "Communication",
                    "Connect email securely for future, explicitly approved workflows.",
                    List.of("Managed OAuth", "Connection management"),
                    List.of()),
            definition(
                    "github",
                    "GitHub",
                    "Developer tools",
                    "Verify your GitHub identity with a harmless read-only request.",
                    List.of("Managed OAuth", "Read-only identity check"),
                    List.of(GITHUB_PROFILE)),
            definition(
                    "notion",
                    "Notion",
                    "Knowledge",
                    "Prepare a secure bridge between selected Notion content and ChatSaver.",
                    List.of("Managed OAuth", "Connection management"),
                    List.of()),
            definition(
                    "slack",
                    "Slack",
                    "Communication",
                    "Connect a Slack workspace without exposing workspace credentials.",
                    List.of("Managed OAuth", "Connection management"),
                    List.of()),
            definition(
                    "dropbox",
                    "Dropbox",
                    "Storage",
                    "Prepare Dropbox for approved file workflows while credentials stay isolated.",
                    List.of("Managed OAuth", "Connection management"),
                    List.of()));

    private static final Map<String, IntegrationDefinition> BY_SLUG = DEFINITIONS.stream()
            .collect(java.util.stream.Collectors.toUnmodifiableMap(
                    IntegrationDefinition::slug,
                    definition -> definition));

    public List<IntegrationDefinition> definitions(boolean configured) {
        return DEFINITIONS.stream()
                .map(definition -> new IntegrationDefinition(
                        definition.slug(),
                        definition.name(),
                        definition.category(),
                        definition.description(),
                        definition.capabilities(),
                        definition.actions(),
                        configured))
                .toList();
    }

    public IntegrationDefinition requireToolkit(String toolkit) {
        String normalized = toolkit == null ? "" : toolkit.trim().toLowerCase(Locale.ROOT);
        IntegrationDefinition definition = BY_SLUG.get(normalized);
        if (definition == null) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "That integration is not available.");
        }
        return definition;
    }

    public IntegrationAction requireAction(String toolkit, String action) {
        return requireToolkit(toolkit).actions().stream()
                .filter(candidate -> candidate.id().equals(action))
                .findFirst()
                .orElseThrow(() -> new IntegrationException(
                        HttpStatus.BAD_REQUEST,
                        "That integration action is not allowed."));
    }

    public IntegrationAction requireAction(String action) {
        return DEFINITIONS.stream()
                .flatMap(definition -> definition.actions().stream())
                .filter(candidate -> candidate.id().equals(action))
                .findFirst()
                .orElseThrow(() -> new IntegrationException(
                        HttpStatus.BAD_REQUEST,
                        "That integration action is not allowed."));
    }

    public boolean contains(String toolkit) {
        return toolkit != null && BY_SLUG.containsKey(toolkit.toLowerCase(Locale.ROOT));
    }

    private static IntegrationDefinition definition(
            String slug,
            String name,
            String category,
            String description,
            List<String> capabilities,
            List<IntegrationAction> actions) {
        return new IntegrationDefinition(
                slug,
                name,
                category,
                description,
                List.copyOf(capabilities),
                List.copyOf(actions),
                false);
    }
}
