# Context:

 Stack Overview

  This setup involves three main components working in sequence to download audiobooks from Listenarr using a debrid service:

   1. Listenarr & Prowlarr: Listenarr initiates a search for an audiobook. It sends this search request to Prowlarr, which finds a magnet:
      link for the desired content from an indexer like AudioBookBay.

   2. Torznab Proxy: Instead of Listenarr talking directly to Prowlarr, it talks to this proxy. The proxy intercepts Prowlarr's response
      and rewrites the download link. Instead of a direct magnet: link (which Listenarr can't send to RDT Client), it creates a special
      HTTP link (e.g., http://your-proxy-ip/dl/...).

   3. Patched RDT Client: Listenarr sends this special HTTP link to your patched rdt-client, thinking it's a standard .torrent file
      download. The patch on this rdt-client then does the following:
       * It downloads the content from the proxy's HTTP link.
       * It intelligently checks the content, sees that it's actually a magnet: link in plain text.
       * It correctly processes this as a magnet link and sends it to your configured debrid service (e.g., AllDebrid, Real-Debrid) for
         downloading.

  This workflow bridges the gap between Listenarr's download client integration and indexers that only provide magnet links, with the
  proxy and the patched rdt-client acting as the essential intermediaries.

#  Repos:
  1. Proxy: https://github.com/gitsumhubs/torznab-proxy
  2. RDT-Client-forked: https://github.com/gitsumhubs/rdt-client-listenarr-magnets
  3. Listenarr: https://github.com/therobbiedavis/Listenarr


# Setup

  Guide: Setting Up the Listenarr Trio Stack

  This guide explains how to deploy the full audiobook automation stack, consisting of a patched RDT Client, the Torznab Proxy, and
  Listenarr/Prowlarr.

  Prerequisites

   * A server with Docker and Docker Compose installed.
   * Your patched rdt-client and torznab-proxy images pushed to your GitHub Packages registry (ghcr.io).
   * The IP addresses of your server and your Prowlarr instance.

  ---

  Step 1: Deploy the Patched RDT Client

  This is your download client that can correctly handle magnet links provided by the proxy.

   1. Create a directory for your RDT Client:
   1     mkdir -p /docker/rdt-client
   2     cd /docker/rdt-client

   2. Create a docker-compose.yml file in this directory and paste the following content:

    1     services:
    2       rdtclient:
    3         image: ghcr.io/gitsumhubs/rdt-client-listenarr-magnets:latest
    4         container_name: rdtclient
    5         environment:
    6           - PUID=1000
    7           - PGID=1000
    8           - TZ=America/Detroit
    9         volumes:
   10           - ./config:/data/db
   11           - /path/to/your/downloads:/downloads #! CHANGE THIS
   12         ports:
   13           - "6500:6500"
   14         restart: unless-stopped
      Action: Change /path/to/your/downloads to your actual downloads folder.

   3. Start the container:
   1     docker compose up -d

  ---

  Step 2: Deploy the Torznab Proxy

  This proxy rewrites Prowlarr's URLs so they can be correctly handled by the patched RDT Client.

   1. Create a directory for your proxy:
   1     mkdir -p /docker/torznab-proxy
   2     cd /docker/torznab-proxy

   2. Create a docker-compose.yml file in this directory and paste the following content:

    1     services:
    2       torznab-proxy:
    3         image: ghcr.io/gitsumhubs/torznab-proxy:latest
    4         container_name: torznab-proxy
    5         environment:
    6           - PROWLARR_BASE=http://your_prowlarr_ip:9696 #! CHANGE THIS
    7           - PROXY_BASE=http://your_server_ip #! CHANGE THIS
    8         ports:
    9           - "80:9797"
   10         restart: unless-stopped
      Action: Change your_prowlarr_ip to the IP of your Prowlarr container and your_server_ip to the IP of the server running this proxy.

   3. Start the container:
   1     docker compose up -d

  ---

  Step 3: Configure Listenarr and Prowlarr

   1. Set up Prowlarr: Ensure Prowlarr is running and has your desired indexer (e.g., AudioBookBay) configured. Note its indexer ID (e.g.,
      1).

   2. Configure Listenarr's Download Client:
       * In Listenarr, go to Settings > Download Clients.
       * Add a new qBittorrent client.
       * Point it to your RDT Client:
           * Host: Your server's IP
           * Port: 6500

   3. Configure Listenarr's Indexer:
       * In Listenarr, go to Settings > Indexers.
       * Add a new Torznab indexer.
       * Crucially, point it to your `torznab-proxy`, not directly to Prowlarr. The URL will look something like this, replacing the IP
         and indexer ID:
           * http://your_server_ip/api/v1/indexer/1/newznab

  Your setup is now complete. When Listenarr finds a download, it will talk to the proxy, which will then talk to Prowlarr, rewrite the
  URL, and send it to your patched RDT Client to be processed correctly
  

# Torznab Proxy for Listenarr

This is a simple Node.js proxy designed to sit between Listenarr and Prowlarr. Its primary purpose is to rewrite Prowlarr URLs and handle magnet link redirection, ensuring smooth operation between Listenarr, RDT clients, and debrid services.

This was created to solve a specific issue where an RDT client expected a `.torrent` file but was instead receiving a `magnet:` link as plain text from an HTTP endpoint.

Use this rdt-client fork with it. 

## Features

- Fixes Listenarr’s URL mangling of Prowlarr API endpoints
- Rewrites Prowlarr download URLs into a proxy-compatible format
- Correctly serves `magnet:` links with the appropriate content type when a Prowlarr download redirects to a magnet link

## Usage

This application is designed to be run as a Docker container. The recommended way to run it is with `docker-compose`.

### Docker Compose

Create a `docker-compose.yml` file with the following content:

```yaml
services:
  torznab-proxy:
    image: ghcr.io/gitsumhubs/torznab-proxy:latest
    container_name: torznab-proxy
    environment:
      - PROWLARR_BASE=http://your_prowlarr_ip:9696
      - PROXY_BASE=http://your_proxy_ip
      - SAFE_FILE_NAME=download.torrent
    ports:
      - "80:9797"
    restart: unless-stopped
```


## Start the container:

```
docker compose up -d
```
## Environment Variables

| Variable | Description | Example |
|---------|-------------|---------|
| PROWLARR_BASE | Base URL of your Prowlarr instance | http://192.168.1.10:9696 |
| PROXY_BASE | Base URL where this proxy runs | http://192.168.1.10 |
| SAFE_FILE_NAME | Safe filename for rewritten links | download.torrent |


Point Listenarr’s Prowlarr indexer at this proxy instead of directly at Prowlarr.

Example:

http://192.168.1.10/api/v1/indexer/1/newznab
