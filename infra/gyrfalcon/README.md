# Gyrfalcon (document search)

OctoSlides' `search_document` tool searches users' saved documents through
[Gyrfalcon](https://github.com/lucasdmarshall/Gyrfalcon), a hybrid BM25 + dense
retrieval engine, served on `127.0.0.1:7700`. The HTTP API has no auth: never
expose it beyond localhost. Every chunk carries `user_id`; every search filters on it.

## Install (server)

```sh
git clone --depth 1 https://github.com/lucasdmarshall/Gyrfalcon /opt/gyrfalcon/src
docker run --rm -v /opt/gyrfalcon/src:/src -v /opt/gyrfalcon/cargo:/usr/local/cargo/registry -w /src \
  rust:1-bookworm cargo build --release -p gyr-cli
install -D -m 755 /opt/gyrfalcon/src/target/release/gyr /opt/gyrfalcon/bin/gyr
# lite tier model (static, no ONNX runtime)
d=/opt/gyrfalcon/models/potion-retrieval-32M; mkdir -p $d
for f in config.json model.safetensors tokenizer.json; do
  curl -fsSL -o $d/$f https://huggingface.co/minishlab/potion-retrieval-32M/resolve/main/$f
done
useradd --system --no-create-home --shell /usr/sbin/nologin gyrfalcon
install -d -o gyrfalcon -g gyrfalcon /var/lib/gyrfalcon
cp infra/gyrfalcon/gyrfalcon.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now gyrfalcon
curl -s 127.0.0.1:7700/health
```

Apply `migrations/005_rag_index_state.sql`. Documents are indexed when saved, and
lazily (on first search) if they were saved before this existed.
