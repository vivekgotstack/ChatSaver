package dev.chatsaver.api.integration;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import dev.chatsaver.api.integration.IntegrationModels.IntegrationAction;
import dev.chatsaver.api.integration.IntegrationModels.IntegrationDefinition;

@Component
public class IntegrationCatalog {

    private static IntegrationAction action(String id, String label, String description) {
        return new IntegrationAction(id, label, description, true);
    }

    private static final List<IntegrationDefinition> DEFINITIONS = List.of(
            definition(
                    "googledrive",
                    "Google Drive",
                    "Storage",
                    "Find selected Docs and files, then import them as editable knowledge notes.",
                    List.of("Managed OAuth", "File search", "Read-only import"),
                    List.of(
                            action("drive-search", "Find files", "Search files you can access."),
                            action("drive-import", "Import file", "Import one selected file as a note."))),
            definition(
                    "gmail",
                    "Gmail",
                    "Communication",
                    "Find a useful email or thread and preserve it as an editable knowledge note.",
                    List.of("Managed OAuth", "Email search", "Read-only import"),
                    List.of(
                            action("gmail-search", "Find email", "Search your mailbox."),
                            action("gmail-import-message", "Save email", "Save one selected email."),
                            action("gmail-import-thread", "Save thread", "Save one selected email thread."))),
            definition(
                    "github",
                    "GitHub",
                    "Developer tools",
                    "Import a repository README, issue, pull request, or discussion from its URL.",
                    List.of("Managed OAuth", "URL import", "Read-only access"),
                    List.of(action("github-import", "Import from GitHub", "Import one supported GitHub URL."))),
            definition(
                    "notion",
                    "Notion",
                    "Knowledge",
                    "Find an authorized page and import it as editable Markdown in ChatSaver.",
                    List.of("Managed OAuth", "Page search", "Read-only import"),
                    List.of(
                            action("notion-search", "Find pages", "Search authorized Notion pages."),
                            action("notion-import", "Import page", "Import one selected page."))),
            definition(
                    "slack",
                    "Slack",
                    "Communication",
                    "Find a useful message and save its conversation thread as a knowledge note.",
                    List.of("Managed OAuth", "Message search", "Read-only thread import"),
                    List.of(
                            action("slack-search", "Find messages", "Search messages you can access."),
                            action("slack-import-thread", "Save thread", "Save the selected Slack thread."))),
            definition(
                    "linkedin",
                    "LinkedIn",
                    "Professional",
                    "Turn your professional profile and selected posts into editable career and insight workspaces.",
                    List.of("Managed OAuth", "Career workspace", "Post insight workspace"),
                    List.of(
                            action("linkedin-import-profile", "Save my profile", "Save your connected profile as a note."),
                            action("linkedin-import-post", "Import post", "Import one selected LinkedIn post."))));

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
