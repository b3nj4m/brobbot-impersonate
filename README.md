### brobbot-impersonate

Enable Brobbot to learn from chat history and impersonate users.

```
Bob: pizza is super good
Alice: brobbot impersonate bob
Brobbot: impersonating Bob
Eve: I love pizza
Brobbot: pizza is super
...
```

### Model

Currently uses simple Markov chain based on [markov-respond](https://github.com/b3nj4m/node-markov).

### Configuration

#### Operation mode

Set the mode of operation (default 'train'). Can be one of 'train', 'respond', 'train_respond'.

```
BROBBOT_IMPERSONATE_MODE=mode
```

#### Minimum number of words

Ignore messages with fewer than `N` words (default 1).

```
BROBBOT_IMPERSONATE_MIN_WORDS=N
```

#### Initialization timeout

Wait for N milliseconds for brobbot to initialize and load brain data from redis. (default 10000)

```
BROBBOT_IMPERSONATE_INIT_TIMEOUT=N
```

#### Case sensitivity

Whether to keep the original case of words. (default false)

```
BROBBOT_IMPERSONATE_CASE_SENSITIVE=true|false
```

#### Strip punctuation

Whether to strip punctuation/symbols from messages. (default false)

```
BROBBOT_IMPERSONATE_STRIP_PUNCTUATION=true|false
```

### Commands

#### Impersonate

Start impersonating `<user>`.

```
brobbot impersonate <user>
```

#### Stop

Stop impersonating.

```
brobbot stop impersonating
```

