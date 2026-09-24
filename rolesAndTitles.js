const getTopPlayers = require("./rankingSystem");

module.exports = async function applyRoles(guild, data) {
  const rank = getTopPlayers(data);

  const roles = {
    first: "Penguasa Nalar Semesta",
    second: "Ahli Logika Anti Gagal",
    third: "Pemikir Berkarisma Rendah"
  };

  for (const key of Object.keys(roles)) {
    let role = guild.roles.cache.find(r => r.name === roles[key]);
    if (!role) {
      role = await guild.roles.create({
        name: roles[key],
        color: key === "first" ? "Gold" : key === "second" ? "Blue" : "Purple"
      });
    }

    const id = rank[key];
    guild.members.cache.forEach(m => m.roles.remove(role).catch(() => {}));
    if (id) {
      const member = guild.members.cache.get(id);
      if (member) member.roles.add(role).catch(() => {});
    }
  }
};
