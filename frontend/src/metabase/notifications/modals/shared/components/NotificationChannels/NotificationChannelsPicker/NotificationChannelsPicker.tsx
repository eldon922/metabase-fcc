import { useEffect, useMemo, useReducer, useState } from "react";
import { t } from "ttag";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { ChannelSettingsBlock } from "metabase/notifications/channels/ChannelSettingsBlock";
import { EmailChannelEdit } from "metabase/notifications/channels/EmailChannelEdit";
import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import {
  type ChannelToAddOption,
  NotificationChannelsAddMenu,
} from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsAddMenu";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Stack,
  Tabs,
  TextInput,
  Textarea,
} from "metabase/ui";
import type {
  ChannelApiResponse,
  NotificationHandler,
  User,
} from "metabase-types/api";

const DEFAULT_CHANNELS_CONFIG = {
  email: { name: t`Email`, type: "email" },
  slack: { name: t`Slack`, type: "slack" },
  http: { name: t`Http`, type: "http" },
};

// Template state types
interface TemplateState {
  activeTab: string | null;
  applyToAllTabs: boolean;
  templates: {
    email: { subject: string; body: string } | null;
    slack: { subject: string; body: string } | null;
    webhook: { subject: string; body: string } | null;
    shared: { subject: string; body: string };
  };
}

// Template actions
type TemplateAction =
  | { type: "SET_ACTIVE_TAB"; tab: string | null }
  | { type: "SET_APPLY_TO_ALL"; value: boolean }
  | {
      type: "UPDATE_TEMPLATE";
      channel: "email" | "slack" | "webhook" | "shared";
      field: "subject" | "body";
      value: string;
    }
  | { type: "REMOVE_TEMPLATE"; channel: "email" | "slack" | "webhook" };

interface NotificationChannelsPickerProps {
  notificationHandlers: NotificationHandler[];
  channels: ChannelApiResponse["channels"] | undefined;
  onChange: (newHandlers: NotificationHandler[]) => void;
  emailRecipientText: string;
  getInvalidRecipientText: (domains: string) => string;
  enableTemplates?: boolean;
}
interface TemplateInputsProps {
  templateState: TemplateState;
  dispatch: React.Dispatch<TemplateAction>;
  updateTemplateForActiveChannel: () => void;
}

const TemplateInputs = ({
  templateState,
  dispatch,
  updateTemplateForActiveChannel,
}: TemplateInputsProps) => {
  const activeChannel = templateState.activeTab as
    | "email"
    | "slack"
    | "webhook";
  const channel = templateState.applyToAllTabs ? "shared" : activeChannel;

  const getTemplateValue = (
    templateChannel: typeof channel,
    field: "subject" | "body",
  ) => {
    if (templateChannel === "shared") {
      return templateState.templates.shared[field];
    }

    return templateState.templates[templateChannel]?.[field] || "";
  };

  const [validationErrors, setValidationErrors] = useState({
    subject: false,
    body: false,
  });

  const subjectValue = getTemplateValue(channel, "subject");
  const bodyValue = getTemplateValue(channel, "body");

  const handleUpdate = (field: "subject" | "body", value: string) => {
    dispatch({
      type: "UPDATE_TEMPLATE",
      channel,
      field,
      value,
    });

    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: false,
      }));
    }
  };

  // Validate on blur and handle template updates
  const handleBlur = () => {
    const hasSubject = !!subjectValue.trim();
    const hasBody = !!bodyValue.trim();

    setValidationErrors({
      subject: !hasSubject && hasBody,
      body: hasSubject && !hasBody,
    });

    if (!hasSubject && !hasBody && channel !== "shared") {
      dispatch({
        type: "REMOVE_TEMPLATE",
        channel: channel as "email" | "slack" | "webhook",
      });
    } else {
      if ((hasSubject && hasBody) || channel === "shared") {
        updateTemplateForActiveChannel();
      }
    }
  };

  const errorMsg = t`Both subject and content are required`;
  const inputConfig = {
    subject: {
      placeholder: templateState.applyToAllTabs
        ? t`Enter subject for all channels`
        : t`Enter subject for ${templateState.activeTab}`,
      value: subjectValue,
      onChange: (value: string) => handleUpdate("subject", value),
      error: validationErrors.subject ? errorMsg : undefined,
    },
    body: {
      placeholder: templateState.applyToAllTabs
        ? t`Enter content for all channels`
        : t`Enter content for ${templateState.activeTab}`,
      value: bodyValue,
      onChange: (value: string) => handleUpdate("body", value),
      error: validationErrors.body ? errorMsg : undefined,
    },
  };

  return (
    <>
      <TextInput
        label={t`Subject`}
        placeholder={inputConfig.subject.placeholder}
        value={inputConfig.subject.value}
        onChange={event =>
          inputConfig.subject.onChange(event.currentTarget.value)
        }
        onBlur={handleBlur}
        error={inputConfig.subject.error}
        mb="md"
      />

      <Textarea
        autosize
        label={t`Content`}
        placeholder={inputConfig.body.placeholder}
        minRows={4}
        value={inputConfig.body.value}
        onChange={event => inputConfig.body.onChange(event.currentTarget.value)}
        onBlur={handleBlur}
        error={inputConfig.body.error}
      />
    </>
  );
};

// Reducer function for template state management
const templateReducer = (
  state: TemplateState,
  action: TemplateAction,
): TemplateState => {
  switch (action.type) {
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_APPLY_TO_ALL":
      return { ...state, applyToAllTabs: action.value };
    case "UPDATE_TEMPLATE":
      if (action.channel === "shared" || state.templates[action.channel]) {
        return {
          ...state,
          templates: {
            ...state.templates,
            [action.channel]:
              action.channel === "shared"
                ? {
                    ...state.templates.shared,
                    [action.field]: action.value,
                  }
                : state.templates[action.channel]
                  ? {
                      ...state.templates[action.channel],
                      [action.field]: action.value,
                    }
                  : null,
          },
        };
      }
      return state;
    case "REMOVE_TEMPLATE":
      return {
        ...state,
        templates: {
          ...state.templates,
          [action.channel]: null,
        },
        // If the active tab is being removed, we need to switch to another tab
        ...(state.activeTab === action.channel && {
          activeTab:
            action.channel === "email"
              ? state.templates.slack
                ? "slack"
                : state.templates.webhook
                  ? "webhook"
                  : null
              : action.channel === "slack"
                ? state.templates.email
                  ? "email"
                  : state.templates.webhook
                    ? "webhook"
                    : null
                : state.templates.email
                  ? "email"
                  : state.templates.slack
                    ? "slack"
                    : null,
        }),
      };
    default:
      return state;
  }
};

const templateTypeMap = {
  "channel/email": {
    name: t`Email template`,
    type: "email/handlebars-text",
    stateKey: "email",
  },
  "channel/slack": {
    name: t`Slack template`,
    type: "slack/handlebars-text",
    stateKey: "slack",
  },
  "channel/http": {
    name: t`Webhook template`,
    type: "http/handlebars-json",
    stateKey: "webhook",
  },
};

// Determine if a handler should be updated with template content
const shouldUpdateHandler = (
  handler: NotificationHandler,
  applyToAllTabs: boolean,
  activeTab: string | null,
): boolean => {
  const channelType = handler.channel_type as keyof typeof templateTypeMap;
  const stateKey = templateTypeMap[channelType]?.stateKey;

  if (!stateKey) {
    return false;
  }

  // Update if using shared template or if this is the active channel
  return applyToAllTabs || activeTab === stateKey;
};

// Get template content for a handler
const getTemplateContent = (
  handler: NotificationHandler,
  templates: TemplateState["templates"],
  applyToAllTabs: boolean,
) => {
  const channelType = handler.channel_type as keyof typeof templateTypeMap;
  const stateKey = templateTypeMap[channelType]?.stateKey as
    | "email"
    | "slack"
    | "webhook";

  // Use shared template or channel-specific template
  return applyToAllTabs ? templates.shared : templates[stateKey];
};

export const NotificationChannelsPicker = ({
  notificationHandlers,
  channels: nullableChannels,
  onChange,
  getInvalidRecipientText,
  enableTemplates = false,
}: NotificationChannelsPickerProps) => {
  const { data: httpChannelsConfig = [] } = useListChannelsQuery();
  const { data: users } = useListUserRecipientsQuery();
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const usersListOptions: User[] = users?.data || (user ? [user] : []);

  // Default to show the default channels until full formInput is loaded
  const channels = (nullableChannels ||
    DEFAULT_CHANNELS_CONFIG) as ChannelApiResponse["channels"];

  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notificationHandlers);

  // Determine which channels are available
  const hasEmailChannel = channels.email?.configured && !!emailHandler;
  const hasSlackChannel = channels.slack?.configured && !!slackHandler;
  const hasWebhookChannel =
    userCanAccessSettings && hookHandlers && hookHandlers.length > 0;

  // Calculate if we should show the templates section
  const hasAnyChannel = hasEmailChannel || hasSlackChannel || hasWebhookChannel;
  const canShowTemplates = enableTemplates && hasAnyChannel;

  // Check if any handlers have templates already configured
  const hasExistingTemplates = useMemo(() => {
    return notificationHandlers.some(
      handler =>
        handler.template &&
        handler.template.details &&
        (handler.template.details.subject?.trim() ||
          handler.template.details.body?.trim()),
    );
  }, [notificationHandlers]);

  // Template visibility state - show if templates already exist, otherwise hide by default
  const [showTemplateSection, setShowTemplateSection] =
    useState(hasExistingTemplates);

  // Initial state for templates
  const initialTemplateState: TemplateState = useMemo(() => {
    // Extract existing template data from notification handlers
    const extractTemplateData = () => {
      const templates = {
        email: hasEmailChannel ? { subject: "", body: "" } : null,
        slack: hasSlackChannel ? { subject: "", body: "" } : null,
        webhook: hasWebhookChannel ? { subject: "", body: "" } : null,
        shared: { subject: "", body: "" },
      };

      // Look for existing templates in handlers
      notificationHandlers.forEach(handler => {
        if (!handler.template) {
          return;
        }

        const { channel_type, details } = handler.template;
        const channelType = channel_type as keyof typeof templateTypeMap;
        const stateKey = templateTypeMap[channelType]?.stateKey;

        if (!stateKey || !details?.subject || !details?.body) {
          return;
        }

        // Populate template data from handler
        if (stateKey === "email" && templates.email) {
          templates.email.subject = details.subject;
          templates.email.body = details.body;
        } else if (stateKey === "slack" && templates.slack) {
          templates.slack.subject = details.subject;
          templates.slack.body = details.body;
        } else if (stateKey === "webhook" && templates.webhook) {
          templates.webhook.subject = details.subject;
          templates.webhook.body = details.body;
        }

        // If only one template is present, also use it for shared template
        const activeTemplates = [
          templates.email,
          templates.slack,
          templates.webhook,
        ].filter(Boolean);
        if (activeTemplates.length === 1 && activeTemplates[0]) {
          templates.shared.subject = activeTemplates[0].subject;
          templates.shared.body = activeTemplates[0].body;
        }
      });

      return templates;
    };

    return {
      activeTab: hasEmailChannel
        ? "email"
        : hasSlackChannel
          ? "slack"
          : hasWebhookChannel
            ? "webhook"
            : null,
      applyToAllTabs: false,
      templates: extractTemplateData(),
    };
  }, [
    hasEmailChannel,
    hasSlackChannel,
    hasWebhookChannel,
    notificationHandlers,
  ]);

  useEffect(() => {
    if (showTemplateSection) {
      dispatch({ type: "SET_ACTIVE_TAB", tab: initialTemplateState.activeTab });
    }
  }, [showTemplateSection, initialTemplateState]);

  const [templateState, dispatch] = useReducer(
    templateReducer,
    initialTemplateState,
  );

  const addChannel = (channel: ChannelToAddOption) => {
    let newChannel: NotificationHandler;

    switch (channel.type) {
      case "channel/http": {
        newChannel = {
          channel_type: channel.type,
          channel_id: channel.channel_id,
          recipients: [],
        };
        break;
      }

      case "channel/email": {
        newChannel = {
          channel_type: channel.type,
          recipients: user
            ? [
                {
                  type: "notification-recipient/user",
                  user_id: user.id,
                  details: null,
                },
              ]
            : [],
        };
        break;
      }

      case "channel/slack": {
        newChannel = {
          channel_type: channel.type,
          recipients: [],
        };
        break;
      }
    }

    onChange(notificationHandlers.concat(newChannel));
  };

  const onChannelChange = (
    oldConfig: NotificationHandler,
    newConfig: NotificationHandler,
  ) => {
    const updatedChannels = notificationHandlers.map(value =>
      value === oldConfig ? newConfig : value,
    );

    onChange(updatedChannels);
  };

  const onRemoveChannel = (channel: NotificationHandler) => {
    const updatedChannels = notificationHandlers.filter(
      value => value !== channel,
    );

    // Set the template to null for the removed channel
    if (enableTemplates) {
      if (channel.channel_type === "channel/email") {
        dispatch({ type: "REMOVE_TEMPLATE", channel: "email" });
      } else if (channel.channel_type === "channel/slack") {
        dispatch({ type: "REMOVE_TEMPLATE", channel: "slack" });
      } else if (channel.channel_type === "channel/http") {
        dispatch({ type: "REMOVE_TEMPLATE", channel: "webhook" });
      }
    }

    onChange(updatedChannels);
  };

  // Function to update template for the active channel
  const updateTemplateForActiveChannel = () => {
    if (!enableTemplates) {
      return;
    }

    // Update all applicable handlers using the extracted utility functions
    const updatedHandlers = notificationHandlers.map(handler => {
      // Check if this handler should be updated based on current state
      if (
        !shouldUpdateHandler(
          handler,
          templateState.applyToAllTabs,
          templateState.activeTab,
        )
      ) {
        return handler;
      }

      const channelType = handler.channel_type as keyof typeof templateTypeMap;
      if (!templateTypeMap[channelType]) {
        return handler;
      }

      const templateConfig = templateTypeMap[channelType];
      const templateContent = getTemplateContent(
        handler,
        templateState.templates,
        templateState.applyToAllTabs,
      );

      // Skip if no template content
      if (!templateContent) {
        return handler;
      }

      // Update the handler with the template
      return {
        ...handler,
        template: {
          name: templateConfig.name,
          channel_type: channelType,
          details: {
            type: templateConfig.type,
            subject: templateContent.subject,
            body: templateContent.body,
          },
        },
      };
    });

    onChange(updatedHandlers);
  };

  return (
    <Stack gap="xl" align="start" w="100%">
      {channels.email?.configured && !!emailHandler && (
        <ChannelSettingsBlock
          title={t`Email`}
          iconName="mail"
          onRemoveChannel={() => onRemoveChannel(emailHandler)}
        >
          <EmailChannelEdit
            channel={emailHandler}
            users={usersListOptions}
            invalidRecipientText={getInvalidRecipientText}
            onChange={newConfig => onChannelChange(emailHandler, newConfig)}
          />
        </ChannelSettingsBlock>
      )}

      {channels.slack?.configured && !!slackHandler && (
        <ChannelSettingsBlock
          title={t`Slack`}
          iconName="int"
          onRemoveChannel={() => onRemoveChannel(slackHandler)}
        >
          <SlackChannelFieldNew
            channel={slackHandler}
            channelSpec={channels.slack}
            onChange={newConfig => onChannelChange(slackHandler, newConfig)}
          />
        </ChannelSettingsBlock>
      )}

      {userCanAccessSettings &&
        hookHandlers &&
        hookHandlers.map(channel => (
          <ChannelSettingsBlock
            key={`webhook-${channel.channel_id}`}
            title={
              httpChannelsConfig.find(({ id }) => id === channel.channel_id)
                ?.name || t`Webhook`
            }
            iconName="webhook"
            onRemoveChannel={() => onRemoveChannel(channel)}
          />
        ))}
      {canShowTemplates && (
        <Flex direction="column" w="100%" align="start">
          {!showTemplateSection && (
            <Button
              p={0}
              variant="subtle"
              onClick={() => setShowTemplateSection(!showTemplateSection)}
            >
              {showTemplateSection ? t`Hide templates` : t`Add custom template`}
            </Button>
          )}
          {showTemplateSection && (
            <Flex direction="column" mb="md" w="100%">
              <Flex justify="space-between" mb="xs">
                <Box>
                  <h3>{t`Custom templates`}</h3>
                </Box>
                {/* Only show the shared template checkbox when multiple channels are present */}
                {[hasEmailChannel, hasSlackChannel, hasWebhookChannel].filter(
                  Boolean,
                ).length >= 2 && (
                  <Checkbox
                    label={t`Share between channels`}
                    checked={templateState.applyToAllTabs}
                    onChange={event =>
                      dispatch({
                        type: "SET_APPLY_TO_ALL",
                        value: event.currentTarget.checked,
                      })
                    }
                  />
                )}
              </Flex>

              <Tabs
                value={templateState.activeTab}
                onChange={value => {
                  if (!templateState.applyToAllTabs) {
                    dispatch({ type: "SET_ACTIVE_TAB", tab: value });
                  }
                }}
              >
                <Tabs.List>
                  {hasEmailChannel && (
                    <Tabs.Tab
                      disabled={templateState.applyToAllTabs}
                      value="email"
                    >{t`Email`}</Tabs.Tab>
                  )}
                  {hasSlackChannel && (
                    <Tabs.Tab
                      disabled={templateState.applyToAllTabs}
                      value="slack"
                    >{t`Slack`}</Tabs.Tab>
                  )}
                  {hasWebhookChannel && (
                    <Tabs.Tab
                      disabled={templateState.applyToAllTabs}
                      value="webhook"
                    >{t`Webhook`}</Tabs.Tab>
                  )}
                </Tabs.List>

                <Box mt="md">
                  <TemplateInputs
                    templateState={templateState}
                    dispatch={dispatch}
                    updateTemplateForActiveChannel={
                      updateTemplateForActiveChannel
                    }
                  />
                </Box>
              </Tabs>
            </Flex>
          )}
        </Flex>
      )}

      <NotificationChannelsAddMenu
        notificationHandlers={notificationHandlers}
        channelsSpec={channels}
        httpChannelsConfig={httpChannelsConfig}
        onAddChannel={addChannel}
        userCanAccessSettings={userCanAccessSettings}
      />
    </Stack>
  );
};
