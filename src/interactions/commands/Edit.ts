import Command from "../../modules/interactions/commands/Command";
import ErrorMessages from "../../data/ErrorMessages";
import Guild from "../../db/models/Guild.model";
import Bot from "../../Bot";

import { 
	ApplicationCommandOptionType,
	ChatInputCommandInteraction, 
	ApplicationCommandType,
      ActionRowBuilder,
      TextInputBuilder,
      TextInputStyle,
      ModalBuilder,
      TextChannel,
      NewsChannel
} from "discord.js";

import { RestrictionLevel } from "../../utils/RestrictionUtils";
import { SubmissionType } from "../../data/Types";

export default class EditCommand extends Command {
	constructor(client: Bot) {
		super(client, {
			name: "edit",
			description: "Edit a report or suggestion that you have submitted.",
			restriction: RestrictionLevel.Public,
			type: ApplicationCommandType.ChatInput,
                  modalResponse: true,
                  options: [
                        {
                              name: "type",
                              description: "The submission type to edit.",
                              type: ApplicationCommandOptionType.String,
                              required: true,
                              choices: [
                                    {
                                          name: "Bug Report",
                                          value: "bugs"
                                    },
                                    {
                                          name: "Player Report",
                                          value: "reports"
                                    },
                                    {
                                          name: "Suggestion",
                                          value: "suggestions"
                                    }
                              ]
                        },
                        {
                              name: "id",
                              description: "The number in the report/suggestion's footer.",
                              type: ApplicationCommandOptionType.Number,
                              required: true
                        }
                  ]
		});
	}

	/**
	 * @param {ChatInputCommandInteraction} interaction
	 * @returns {Promise<void>}
	 */
	async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const type = interaction.options.getString("type") as string;
            const id = interaction.options.getNumber("id") as number;

            const channelConfig = await Guild.findOne(
                  { id: interaction.guildId }, 
                  { [`channels.${type}`]: 1, _id: 0 }
            );

            if (!channelConfig?.channels[type]) {
                  await interaction.reply({ 
                        content: ErrorMessages.ChannelNotConfigured,
                        ephemeral: true
                  });

                  return;
            }

            const guildConfig = await Guild.findOne(
                  { id: interaction.guildId },
                  { [type]: 1, _id: 0 }
            );

            const report = guildConfig?.[type as SubmissionType].find(item => item.number === id);

            if (!report) {
                  await interaction.reply({ 
                        content: `Unable to find report \`#${id}\``,
                        ephemeral: true
                  });

                  return;
            }

            const { messageId, author } = report;

            if (author !== interaction.user.id) {
                  await interaction.reply({ 
                        content: "You must be the author of the report in order to edit its content.",
                        ephemeral: true
                  });

                  return;
            }

            const submissionChannel = interaction.guild?.channels.cache.get(channelConfig?.channels[type]) as TextChannel | NewsChannel;

            if (!submissionChannel) {
                  await interaction.reply({ 
                        content: "The submission channel has either been removed or I no longer have access to it.", 
                        ephemeral: true 
                  });

                  return;
            }

            let reportMessage;
            try {
                  reportMessage = await submissionChannel.messages.fetch(messageId);
            } catch {
                  await interaction.reply({ 
                        content: "Unable to retrieve report/suggestion, it may have been removed.",
                        ephemeral: true
                  });

                  return;
            }

            const [embed] = reportMessage.embeds;

            const modal = new ModalBuilder()
                  .setTitle("Edit Submission")
                  .setCustomId(`edit-${type}-${messageId}`);

            const modalComponents: ActionRowBuilder<TextInputBuilder>[] = [];

            embed.fields?.forEach(field => {
                  if (!field.name.includes("Reason")) {
                        modalComponents.push(
                              new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                          .setCustomId(field.name.replaceAll(" ", "-"))
                                          .setLabel(field.name)
                                          .setMinLength(12)
                                          .setMaxLength(1024)
                                          .setValue(field.value)
                                          .setPlaceholder(`${field.name}...`)
                                          .setRequired(true)
                                          .setStyle(TextInputStyle.Paragraph)
                              ) as ActionRowBuilder<TextInputBuilder>
                        );
                  }
            });

            if (modalComponents.length === 0) {
                  modalComponents.push(
                        new ActionRowBuilder().addComponents(
                              new TextInputBuilder()
                                    .setCustomId("suggestion")
                                    .setLabel("Suggestion")
                                    .setMinLength(12)
                                    .setMaxLength(4000)
                                    .setPlaceholder("Suggestion...")
                                    .setValue(embed.description as string || embed.fields?.[0].value as string)
                                    .setRequired(true)
                                    .setStyle(TextInputStyle.Paragraph)
                        ) as ActionRowBuilder<TextInputBuilder>
                  );
            }

            modal.addComponents(modalComponents);
            await interaction.showModal(modal);
	}
}