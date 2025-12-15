const { ALLOWED_OWNER_IDS } = require("../config");

function isAllowedOwner(userId) {
        return ALLOWED_OWNER_IDS.includes(userId);
}

function isServerOwner(interaction) {
        return (
                interaction.member.permissions.has("Administrator") ||
                interaction.guild.ownerId === interaction.user.id
        );
}

function isWhitelistedChannel(channelId) {
        return true;
}

module.exports = {
        isAllowedOwner,
        isServerOwner,
        isWhitelistedChannel,
};
