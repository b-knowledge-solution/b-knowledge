#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""Discord bot integration for the RAG assistant.

Provides a Discord bot that listens for @mentions and forwards user
questions to the RAGFlow completion API. Responses (text and optional
images) are sent back to the Discord channel. Requires manual
configuration of the API URL, conversation ID, API key, and
Discord bot token before use.

This is a standalone utility script, not part of the main task executor.
"""
import logging
import discord
import requests
import base64
import asyncio

# RAGFlow API endpoint for chat completion
URL = '{YOUR_IP_ADDRESS:PORT}/v1/api/completion_aibotk'  # Default: https://demo.ragflow.io/v1/api/completion_aibotk

# Request payload template — conversation_id and Authorization must be configured
JSON_DATA = {
    "conversation_id": "xxxxxxxxxxxxxxxxxxxxxxxxxxx",  # Get conversation id from /api/new_conversation
    "Authorization": "ragflow-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  # RAGFlow Assistant Chat Bot API Key
    "word": ""  # User question, don't need to initialize
}

# Discord bot authentication token
DISCORD_BOT_KEY = "xxxxxxxxxxxxxxxxxxxxxxxxxx"  # Get DISCORD_BOT_KEY from Discord Application

# Set up Discord client with message content intent enabled
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


@client.event
async def on_ready():
    """Log when the Discord bot has connected and is ready."""
    logging.info(f'We have logged in as {client.user}')


@client.event
async def on_message(message):
    """Handle incoming Discord messages.

    Responds to @mentions by forwarding the user's question to the
    RAGFlow API and posting the response (text and optional images)
    back to the Discord channel.

    Args:
        message: The Discord Message object.
    """
    # Ignore messages from the bot itself
    if message.author == client.user:
        return

    if client.user.mentioned_in(message):

        # If the mention has no additional text, send a greeting
        if len(message.content.split('> ')) == 1:
            await message.channel.send("Hi~ How can I help you? ")
        else:
            # Extract the user's question after the mention
            JSON_DATA['word'] = message.content.split('> ')[1]
            response = requests.post(URL, json=JSON_DATA)
            response_data = response.json().get('data', [])
            image_bool = False

            # Parse the response — type 1 is text, type 3 is base64-encoded image
            for i in response_data:
                if i['type'] == 1:
                    res = i['content']
                if i['type'] == 3:
                    image_bool = True
                    image_data = base64.b64decode(i['url'])
                    with open('tmp_image.png', 'wb') as file:
                        file.write(image_data)
                    image = discord.File('tmp_image.png')

            # Send the text response mentioning the original author
            await message.channel.send(f"{message.author.mention}{res}")

            # Send the image if one was included in the response
            if image_bool:
                await message.channel.send(file=image)


# Start the Discord bot event loop
loop = asyncio.get_event_loop()

try:
    loop.run_until_complete(client.start(DISCORD_BOT_KEY))
except KeyboardInterrupt:
    loop.run_until_complete(client.close())
finally:
    loop.close()
