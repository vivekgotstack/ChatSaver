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

    private static IntegrationAction writeAction(String id, String label, String description) {
        return new IntegrationAction(id, label, description, false);
    }

    private static final List<IntegrationDefinition> DEFINITIONS = List.of(
            definition(
                    "googledrive",
                    "Google Drive",
                    "Storage",
                    "Find files, preserve them as notes, and turn source material into structured working briefs.",
                    List.of("File search", "Editable import", "Working briefs"),
                    List.of(
                            action("drive-search", "Find files", "Search files you can access."),
                            action("drive-import", "Import file", "Import one selected file as a note."))),
            definition(
                    "gmail",
                    "Gmail",
                    "Communication",
                    "Capture useful email threads and turn them into action briefs with commitments and reply drafts.",
                    List.of("Email search", "Thread capture", "Action briefs"),
                    List.of(
                            action("gmail-search", "Find email", "Search your mailbox."),
                            action("gmail-import-message", "Save email", "Save one selected email."),
                            action("gmail-import-thread", "Save thread", "Save one selected email thread."))),
            definition(
                    "github",
                    "GitHub",
                    "Developer tools",
                    "Import repository knowledge or publish your ChatSaver vault as a versioned Markdown backup.",
                    List.of("URL import", "README publishing", "Backup repository"),
                    List.of(
                            action("github-import", "Import from GitHub", "Import one supported GitHub URL."),
                            writeAction("github-publish-backup", "Publish Markdown backup", "Commit a ChatSaver backup to an existing repository."),
                            writeAction("github-create-backup-repo", "Create backup repository", "Create a repository and publish the first ChatSaver backup."))),
            definition(
                    "notion",
                    "Notion",
                    "Knowledge",
                    "Bring authorized pages into ChatSaver as editable Markdown or structured decision-ready briefs.",
                    List.of("Page search", "Markdown import", "Working briefs"),
                    List.of(
                            action("notion-search", "Find pages", "Search authorized Notion pages."),
                            action("notion-import", "Import page", "Import one selected page."))),
            definition(
                    "slack",
                    "Slack",
                    "Communication",
                    "Capture decisions from Slack and deliberately publish a ChatSaver knowledge digest to a channel.",
                    List.of("Message search", "Decision workspace", "Digest publishing"),
                    List.of(
                            action("slack-search", "Find messages", "Search messages you can access."),
                            action("slack-import-thread", "Save thread", "Save the selected Slack thread."),
                            writeAction("slack-send-digest", "Publish vault digest", "Send a concise ChatSaver vault digest to one channel."))),
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
