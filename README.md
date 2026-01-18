#  Repo Stack:
  1. Torznab-Proxy: https://github.com/gitsumhubs/torznab-proxy
  2. RDT-Client-forked: https://github.com/gitsumhubs/rdt-client-listenarr-magnets
  3. Listenarr: https://github.com/therobbiedavis/Listenarr
  4. Prowlarr-abb: https://github.com/BitlessByte0/prowlarr-abb
     
# Context:

This is a complete quad-stack designed to bridge a gap in Listenarr's automation workflow, specifically for indexers that only provide
  magnet links.

  The process begins with Listenarr and a specialized Prowlarr fork, which finds the desired audiobook and generates a magnet link.
  However, Listenarr cannot directly send this type of link to the download client in a way it understands.

  To solve this, the Torznab Proxy intercepts the communication. It takes the magnet link from Prowlarr and cleverly rewrites it into a
  standard HTTP download link. Listenarr then passes this new link to the patched RDT Client, believing it's a simple file download. The
  custom patch on the RDT Client allows it to intelligently recognize that this is not a file, but a disguised magnet link, which it then
  correctly processes and sends to your debrid service for downloading

  # Guide: 

Setting Up the Listenarr Quad Stack

  This guide explains how to deploy the full audiobook automation stack, consisting of Listenarr, a Prowlarr fork for AudioBookBay, a
  patched RDT Client, and the Torznab Proxy.

  Prerequisites

   * A server with Docker and Docker Compose installed.
   * Your patched rdt-client and torznab-proxy images pushed to your GitHub Packages registry (ghcr.io).
   * The IP address of your server.

  ---

  Step 1: Deploy the Prowlarr Fork (prowlarr-abb)

  This is the specialized version of Prowlarr that includes the AudioBookBay indexer.

   1. Create a directory for your Prowlarr instance:

   1     mkdir -p /docker/prowlarr-abb
   2     cd /docker/prowlarr-abb

   2. Create a docker-compose.yml file. Based on the repository at https://github.com/BitlessByte0/prowlarr-abb, you'll likely use their
      pre-built image.

    1     services:
    2       prowlarr-abb:
    3         image: ghcr.io/bitlessbyte0/prowlarr-abb:latest
    4         container_name: prowlarr-abb
    5         environment:
    6           - PUID=1000
    7           - PGID=1000
    8           - TZ=America/Detroit
    9         volumes:
   10           - ./config:/config
   11         ports:
   12           - "9696:9696"
   13         restart: unless-stopped
      Note: Please check the prowlarr-abb repository for their official recommended docker-compose.yml if this one doesn't work as
  expected.

   3. Start the container:
   1     docker compose up -d

  ---

  Step 2: Deploy the Patched RDT Client

  This is your download client that correctly handles magnet links from the proxy.

   1. Create a directory:
   1     mkdir -p /docker/rdt-client
   2     cd /docker/rdt-client

   2. Create a docker-compose.yml file with the following:

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

  Step 3: Deploy the Torznab Proxy

  This proxy rewrites Prowlarr's URLs for the RDT Client.

   1. Create a directory:
   1     mkdir -p /docker/torznab-proxy
   2     cd /docker/torznab-proxy

   2. Create a docker-compose.yml file with the following:

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
      Action: Change your_prowlarr_ip to the IP of your prowlarr-abb container and your_server_ip to the IP of the server running this
  proxy.

   3. Start the container:

   1     docker compose up -d

  ---

  Step 4: Configure Listenarr

  Finally, deploy Listenarr as you normally would and configure it to connect all the pieces.

   1. Configure Download Client:
       * In Listenarr Settings > Download Clients, add a qBittorrent client pointing to your RDT Client (http://your_server_ip:6500).

   2. Configure Indexer:
       * In Listenarr Settings > Indexers, add a Torznab indexer.
       * Crucially, point it to your `torznab-proxy`, not directly to Prowlarr. The URL will look something like this (replacing the IP
         and indexer ID from your Prowlarr):
           * http://your_server_ip/api/v1/indexer/1/newznab


  

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
