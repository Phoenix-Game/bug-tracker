import Modal from "../../modules/interactions/modals/Modal";
import PermissionUtils from "../../utils/PermissionUtils";
import ErrorMessages from "../../data/ErrorMessages";
import StringUtils from "../../utils/StringUtils";
import Guild from "../../db/models/Guild.model";
import Properties from "../../data/Properties";
import Bot from "../../Bot";

import { 
      ModalSubmitInteraction, 
      PermissionFlagsBits,
      AttachmentBuilder,
      ActionRowBuilder, 
      ButtonComponent, 
      ButtonBuilder, 
      EmbedBuilder, 
      ButtonStyle,
      TextChannel, 
      NewsChannel,
      ActionRow
} from "discord.js";

import { RestrictionLevel } from "../../utils/RestrictionUtils";
import { BugPriority } from "../../data/Types";

const priorityImage = {
      medium: new AttachmentBuilder("assets/priority/Medium.png", { name: "medium.png" }),
      none: new AttachmentBuilder("assets/priority/None.png", { name: "none.png" }),
      high: new AttachmentBuilder("assets/priority/High.png", { name: "high.png" }),
      low: new AttachmentBuilder("assets/priority/Low.png", { name: "low.png" })
};

export default class BugReportModal extends Modal {
      constructor(client: Bot) {
            super(client, {
                  name: { startsWith: "bug-report" },
                  restriction: RestrictionLevel.Public
            });
      }

      /**
       * @param  {ModalSubmitInteraction} interaction
       * @returns {Promise<void>}
       */
      async execute(interaction: ModalSubmitInteraction): Promise<void> {
            const summary = interaction.fields.getTextInputValue("summary");
            const description = interaction.fields.getTextInputValue("description");
            const reproduction = interaction.fields.getTextInputValue("reproduction");
            const specs = interaction.fields.getTextInputValue("specs");

            const priority = interaction.customId.split("-")[2] as BugPriority;

            const guildConfig = await Guild.findOne(
                  { id: interaction.guildId },
                  { 
                        ["auto.threads.bugs"]: 1,
                        ["channels.bugs"]: 1,
                        bugs: 1,
                        _id: 0 
                  }
            );

            const submissionChannelId = guildConfig?.channels.bugs;

            if (!submissionChannelId) {
                  await interaction.editReply(ErrorMessages.ChannelNotConfigured);
                  return;
            }

            const submissionChannel = interaction.guild?.channels.cache.get(submissionChannelId) as TextChannel | NewsChannel;

            if (!submissionChannel) {
                  await interaction.editReply(ErrorMessages.ChannelNotFound);
                  return;
            }

            if (!await PermissionUtils.botHasPermissions(interaction, [
                  PermissionFlagsBits.CreatePublicThreads,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.ManageThreads,
                  PermissionFlagsBits.AddReactions,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.EmbedLinks
            ], submissionChannel)) return;

            const submissionId = guildConfig?.bugs.length + 1;

            const embed = new EmbedBuilder()
                  .setColor(Properties.colors.priority[priority])
                  .setAuthor({ name: `Priority: ${priority.toUpperCase()}` })
                  .setTitle("Bug Report")
                  .setThumbnail(interaction.user.displayAvatarURL())
                  .setFields([
                        {
                              name: "Summary",
                              value: summary,
                        },
                        {
                              name: "Description",
                              value: description,
                        }
                  ])
                  .setThumbnail(`attachment://${priority}.png`)
                  .setFooter({ text: `#${submissionId}` })
                  .setTimestamp();
            
            if (reproduction) {
                  embed.data.fields?.push({
                        name: "Reproduction Steps",
                        value: reproduction
                  });
            }

            if (specs) {
                  embed.data.fields?.push({
                        name: "System Specs",
                        value: specs
                  });
            }

            const setStatusButton = new ButtonBuilder()
                  .setCustomId("set-status")
                  .setEmoji(Properties.emojis.edit)
                  .setLabel("Set Status")
                  .setStyle(ButtonStyle.Primary);

            const discussionThreadButton = new ButtonBuilder()
                  .setCustomId("discussion-thread")
                  .setEmoji(Properties.emojis.thread)
                  .setLabel("Discussion Thread")
                  .setStyle(ButtonStyle.Secondary);

            const archiveButton = new ButtonBuilder()
                  .setCustomId("archive")
                  .setEmoji(Properties.emojis.inbox)
                  .setLabel("Archive")
                  .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder().setComponents(
                  setStatusButton,
                  discussionThreadButton,
                  archiveButton
            );

            submissionChannel.send({
                  content: `${interaction.user} (\`${interaction.user.id}\`)`,
                  embeds: [embed],
                  files: [priorityImage[priority]],
                  components: [actionRow.toJSON() as ActionRow<ButtonComponent>]
            }).then(async (message) => {
                  await Guild.updateOne(
                        { id: interaction.guildId },
                        { 
                              $push: {
                                    bugs: {
                                          number: submissionId,
                                          messageId: message.id,
                                          author: interaction.user.id,
                                          summary,
                                          description,
                                          reproduction,
                                          specs,
                                          priority: priority.toUpperCase()
                                    }
                              } 
                        }
                  );

                  if (guildConfig?.auto.threads.bugs) {
                        await message.startThread({
                              name: StringUtils.elipsify(summary, 100),
                              autoArchiveDuration: 10080, // 1 week
                              reason: "Submission discussion thread"
                        });
                  }

                  message.react(Properties.emojis.thumbsUp);
                  message.react(Properties.emojis.thumbsDown);

                  await interaction.editReply("Your bug report has been submitted");
            });

            return;
      }
}