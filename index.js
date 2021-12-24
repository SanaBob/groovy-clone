import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'discord.js';
import ytdl from 'ytdl-core';
import { YTSearcher } from 'ytsearcher';
import { joinVoiceChannel, createAudioResource, createAudioPlayer, VoiceConnectionStatus } from "@discordjs/voice";
import YouTube from 'simple-youtube-api';

const express = require('express');

const app = express();

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));



const key = process.env.YT_KEY1;
const backupKey = process.env.YT_KEY2;

const searcher = new YTSearcher({
    key: key,
    revealed: true
});

const youtube = new YouTube(key);

const client = new Client({ intents: 641 });

let queue = [];
let count = -1;

const prefix = "-";

client.on("ready", () => {
    console.log("ready")
})

let connection = null;
let player = null;
let loop = false;
let loopSong = false;
let channelId = null;

const shuffle = (array) => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

const skip = async (message) => {
    try {
        if (loopSong) {
            message.channel.send("Now Playing: " + queue[count].title);
            const resource = await getNextResource();
            const player1 = createAudioPlayer(connection, resource);
            connection.subscribe(player1);
            player1.play(resource);
            player1.on("idle", () => {
                skip(message);
            });
            player = player1;
            return;
        }
        count++;
        if (count < queue.length) {
            try {
                message.channel.send("Now Playing: " + queue[count].title);
                const resource = await getNextResource();
                if (!resource) skip(message);
                const player1 = createAudioPlayer(connection, resource);
                connection.subscribe(player1);
                player1.play(resource);
                player1.on("idle", () => {
                    skip(message);
                });
                player = player1
            } catch (e) {
                message.channel.send("Can't skip/play song");
                skip(message);
            }
        } else {
            if (!loop) {
                count = queue.length + 1;
                message.channel.send("No more songs in the queue!");
                player.pause();
            } else {
                try {
                    count = 0;
                    message.channel.send("Now Playing: " + queue[count].title);
                    const resource = await getNextResource();
                    if (!resource) skip(message);
                    const player1 = createAudioPlayer(connection, resource);
                    connection.subscribe(player1);
                    player1.play(resource);
                    player1.on("idle", () => {
                        skip(message);
                    });
                    player = player1
                } catch (e) {
                    message.channel.send("Can't skip/play song");
                    skip(message);
                }
            }
        }
    } catch (e) {
        message.channel.send("Can't skip/play next song");
        skip(message);
    }
}

const getNextResource = async () => {
    try {
        if (!ytdl.validateURL(queue[count].url)) return null;
        let music = await ytdl(queue[count].url, { highWaterMark: 1024 * 1024 * 64, quality: "highestaudio", filter: "audioonly" })
        const resource = await createAudioResource(music, {
            inlineVolume: true,
        });
        resource.volume.setVolume(0.5);
        return resource;
    } catch (error) {
        console.log(error);
    }
    return null;
}

client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(1).split(/ +/);
        const command = args.shift().toLowerCase();

        if (connection && channelId != message.member.voice.channel.id) return message.channel.send("You need to be in the same voice channel as the bot to play music!");

        if (command === "play" || command === "p") {
            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) return message.channel.send("You need to be in a voice channel to play music!");
            const permissions = voiceChannel.permissionsFor(message.client.user);
            if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
                return message.channel.send("I need the permissions to join and speak in your voice channel!");
            }

            let song = null;

            if (ytdl.validateURL(args[0])) {
                const result = await ytdl.getInfo(args[0])
                if (result === null || undefined) return message.channel.send("Invalid URL!");
                song = {
                    title: result.videoDetails.title,
                    url: args[0],
                    requester: message.author.id,
                };
                message.channel.send(`Added to the queue: ${song.title}`);
                queue.push(song);
            } else if (args[0].match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
                const playlist = await youtube.getPlaylist(args[0]);
                const videos = await playlist.getVideos();
                message.channel.send(`Loading...`);
                for (const video of videos) {
                    if (video.title.toLowerCase().includes("deleted video")) continue;
                    const result = await searcher.search(video.title, { type: 'video' });
                    if (result === null) return;
                    song = {
                        title: result.currentPage[0].title,
                        url: result.currentPage[0].url,
                        requester: message.author.id,
                    };
                    queue.push(song);
                }
                message.channel.send(`Playlist with ${videos.length} songs was added to the queue!`);
            } else {
                const result = await searcher.search(args.join(" "), { type: 'video' });
                if (result === null) return message.channel.send("No results found!");
                song = {
                    title: result.currentPage[0].title,
                    url: result.currentPage[0].url,
                    requester: message.author.id,
                };
                message.channel.send(`Added to the queue: ${song.url}`);
                queue.push(song);
            }

            if (!connection || count >= queue.length - 1 || count < 0) {
                connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator
                });
                count++;
                const resource = await createAudioResource(ytdl(song.url, { highWaterMark: 1024 * 1024 * 64, quality: "highestaudio" }), {
                    inlineVolume: true,
                });
                resource.volume.setVolume(0.5);
                const player1 = createAudioPlayer(connection, resource);
                connection.subscribe(player1);
                player1.play(resource);
                message.channel.send("Now Playing: " + song.title);
                player1.on("idle", () => {
                    skip(message);
                });
                player = player1;
                player.unpause();
                channelId = message.member.voice.channel.id;
                connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                    try {
                        await Promise.race([
                            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                        ]);
                        // Seems to be reconnecting to a new channel - ignore disconnect
                    } catch (error) {
                        // Seems to be a real disconnect which SHOULDN'T be recovered from
                        connection.destroy();
                        connection = null;
                        channelId = null;
                        queue = [];
                        count = -1;
                    }
                });
            }

        } else if (command === "skip" || command === "s" || command === "next" || command === "n") {
            skip(message);
        } else if (command === "stop" || command === "st") {
            player.pause();
        } else if (command === "resume") {
            player.unpause();
        } else if (command === "queue" || command === "q") {
            if (count < 0) return message.channel.send("There is no song playing!");
            if (queue.length <= 0) return message.channel.send("There are no songs in the queue!");
            let queueString = "";
            if (queue.length - count < 6) {
                queue.forEach((element, index) => {
                    if (index === count) { queueString = queueString + `--> ${index + 1}. ${element.title} \n`; return }
                    queueString = queueString + `${index + 1}. ${element.title} \n`;
                })
            } else {
                queue.forEach((element, index) => {
                    if (index === count) { queueString = queueString + `--> ${index + 1}. ${element.title} \n`; return }
                    if (index >= count - 1 && index <= count + 3) queueString = queueString + `${index + 1}. ${element.title} \n`;
                })
            }
            queueString = queueString + `${queue.length} songs in the queue`;
            message.channel.send(queueString);
        } else if (command === "leave") {
            connection.destroy();
            connection = null;
            channelId = null;
            queue = [];
            count = -1;
        } else if (command === "jump" || command === "j") {
            if (count < 0) return message.channel.send("There is no song playing!");
            if (!args[0]) return message.channel.send("Please specify the song number!");
            if (args[0] > queue.length) return message.channel.send("That song doesn't exist!");
            count = args[0] - 2;
            skip(message);
        } else if (command === "loop" || command === "l") {
            if (count < 0) return message.channel.send("There is no song playing!");
            if (args[0] === "song" || args[0] === "s" || args[0] === "track" || args[0] === "t") {
                loopSong = !loopSong;
                loop = false;
                message.channel.send(`${loopSong ? "Looping " + queue[count].title : "disabled"}`);
            } else {
                loopSong = false;
                loop = !loop;
                message.channel.send(`Looping is now ${loop ? "enabled" : "disabled"}`);
            }
        } else if (command === "clear" || command === "cl") {
            player.pause();
            queue = [];
            count = -1;
            message.channel.send("Queue cleared!");
        } else if (command === "shuffle" || command === "sh") {
            if (count < 0) return message.channel.send("There is no song playing!");
            const shuffled = shuffle(queue);
            queue = shuffled;
            message.channel.send("Queue shuffled!");
        } else if (command === "delete" || command === "d" || command === "remove" || command === "r" || command === "rm") {
            if (count < 0) return message.channel.send("There is no song playing!");
            if (!args[0]) return message.channel.send("Please specify the song number!");
            try {
                let index = parseInt(args[0]);
                if (!index) {
                    index = queue.findIndex(element => element.title.toLowerCase().includes(args[0].toLowerCase()));
                    if (index === -1) return message.channel.send("That song doesn't exist!");
                    queue.splice(index, 1);
                    message.channel.send("Song deleted!");
                } else {
                    if (index > queue.length || index <= 0) return message.channel.send("That song doesn't exist!");
                    queue.splice(index - 1, 1);
                    message.channel.send("Song deleted!");
                }
                count--;
                if (queue.length <= 0 && count < 0) {
                    message.channel.send("No more songs in the queue!");
                    player.pause();
                    return;
                }
                if (count + 2 === index) skip(message);
            } catch (e) {
                console.log(e);
                return message.channel.send("Please specify the song number or title!");
            }
        } else if (command === "help" || command === "h") {
            message.channel.send(`
            \`\`\`
            ${prefix}play/p <song> - Play a song
            ${prefix}skip/s/next/n - Skip the current song
            ${prefix}stop/st - Stop the current song
            ${prefix}resume - Resume the current song
            ${prefix}queue/q - View the current queue
            ${prefix}leave - Leave the current voice channel
            ${prefix}jump/j <song number> - Jump to a song
            ${prefix}loop/l <song> - Loop the current song
            ${prefix}clear/cl - Clear the queue
            ${prefix}shuffle/sh - Shuffle the queue
            ${prefix}delete/d/remove/rm <song> - Delete a song
            ${prefix}help - View this message
            \`\`\`
            `);
        }
    } catch (e) {
        console.log(e);
    }
});

client.login(process.env.TOKEN);
