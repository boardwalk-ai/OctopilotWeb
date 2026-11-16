# OctoSlides sandbox: runs model-written pptxgenjs scripts and the pptx skill's
# QA tools (validate, text dump, LibreOffice render). Every job runs in a fresh
# container with no network, a read-only root, a non-root user and hard limits
# (see src/server/octoslides/sandbox.ts).
#
# Build on the server:  docker build -t octoslides-sandbox:2 infra/octoslides-sandbox
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

# LibreOffice Impress for PPTX -> PDF, Poppler for PDF -> PNG, fonts whose
# metrics match Office's (Carlito = Calibri, Caladea = Cambria,
# Liberation = Arial / Times New Roman / Courier New) so overflow checks are true.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-impress libreoffice-core \
      fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 fonts-dejavu-core fontconfig \
      poppler-utils \
      python3 python3-pip python3-lxml python3-defusedxml \
 && pip3 install python-pptx==1.0.2 \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# Node libraries the model's scripts may require. NODE_PATH makes them
# resolvable from /work without a node_modules folder there.
WORKDIR /opt/sandbox
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund \
      pptxgenjs@4.0.1 jszip@3.10.1 @xmldom/xmldom@0.8.10 sharp@0.34.5 react@19.2.3 react-dom@19.2.3 react-icons@5.5.0 lucide-static@0.469.0 \
 && npm cache clean --force
ENV NODE_PATH=/opt/sandbox/node_modules

# Anthropic pptx skill scripts (Apache-2.0, see pptx-skill/LICENSE.txt and NOTICE).
COPY pptx-skill /opt/pptx-skill
COPY bin /opt/sandbox/bin
COPY lib /opt/sandbox/lib
RUN chmod -R a+rX /opt/pptx-skill /opt/sandbox && chmod a+x /opt/sandbox/bin/*

# Unprivileged user; HOME on the per-job tmpfs so LibreOffice can write its profile.
RUN useradd --uid 10001 --create-home --home-dir /home/deck deck
USER 10001
ENV HOME=/tmp/home \
    PATH=/opt/sandbox/bin:$PATH
WORKDIR /work
