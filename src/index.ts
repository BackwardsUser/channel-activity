import { Client, Events, GatewayIntentBits, Guild, VoiceBasedChannel } from "discord.js";
import { config } from "dotenv";
import { put } from "axios";

config();

const intents: GatewayIntentBits[] = [GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences]

const client = new Client({ intents });

const jobs = new Map<string, NodeJS.Timeout>();
const server_timeouts = new Map<string, number>();

server_timeouts.set("837036139793350718", 0.5);

function debugLog(...data: any[]) {
  if (process.env.DEBUG)
    console.log(...data);
}

function updateActivity(channel: VoiceBasedChannel): void {
  const members = channel?.members;

  console.log(members)

  if (!members || members.size) {
    if (channel.id && jobs.get(channel.id))
      jobs.delete(channel.id);
    return;
  }

  const activities = new Map<string, number>();

  members.forEach(member => {
    let main_activity: any = member.presence?.activities.filter(activity => activity.type === 0)[0];
    if (!main_activity) {
      main_activity = "none";
    } else {
      main_activity = main_activity.name;
    }

    const activity_count = activities.get(main_activity);
    if (activity_count)
      activities.set(main_activity, activity_count + 1);
    else
      activities.set(main_activity, 1);
  });

  let maxKey: string | undefined;
  let maxValue = -Infinity;

  for (const [key, value] of activities.entries()) {
    if (value > maxValue) {
      maxValue = value;
      maxKey = key;
    }
  }

  debugLog(`Updating ID: ${channel.id}`);

  put(
    `https://discord.com/api/v10/channels/${channel.id}/voice-status`,
    { status: `Playing: ${maxKey}` },
    {
      headers: {
        Authorization: `Bot ${client.token}`,
      },
    }
  );
}

function createInterval(channel: VoiceBasedChannel, guild: Guild) {
  const timeout_mins = (server_timeouts.get(guild.id) || parseInt(process.env.DEFAULT_TIMEOUT_MINS || "5"));
  const timeout_ms = timeout_mins * 1000 * 60;

  debugLog(`Creating interval of ${timeout_mins}mins or ${timeout_ms}ms for ${channel.id}`);


  // Interval time is either a server set otherwise, default.
  if (channel && channel.isVoiceBased()) {
    const interval = setInterval(() => updateActivity(channel), timeout_ms);
    jobs.set(channel.id, interval);
    debugLog("Saved Interval");
    return;
  }
  debugLog("newstate has no channel or is not voice channel. Ignoring.");
}

client.on(Events.ClientReady, (c) => {
  console.log(`Successfully logged in as ${c.user.username}`);
  debugLog("DEBUG MODE: Debug messages will be logged");

  const activeVoiceChannels = client.guilds.cache.flatMap(guild =>
    guild.channels.cache.filter(
      c => c.isVoiceBased() && c.members.size > 0
    )
  );

  for (const activeVoiceChannel of activeVoiceChannels.values()) {
    createInterval(activeVoiceChannel as VoiceBasedChannel, activeVoiceChannel.guild)
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.id !== "471172695862542337")
    return;

  if (message.content === ";test") {
    const user = await message.guild?.members.fetch(message.author.id);
    if (!user || !user.voice.channel)
      return;

    if (message.deletable)
      message.delete();
    updateActivity(user.voice.channel);
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (oldState && oldState.channel && jobs.get(oldState.channel.id)) {
    jobs.delete(oldState.id);
  } else {
    debugLog("No oldState, nothing to delete");
  }

  if (!newState || !newState.channel || jobs.get(newState.id))
    return;

  const channel = newState.channel;

  createInterval(channel, newState.guild);
});

client.login(process.env.TOKEN);