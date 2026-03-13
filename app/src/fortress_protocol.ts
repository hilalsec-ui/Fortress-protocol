/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/fortress_protocol.json`.
 */
export type FortressProtocol = {
  "address": "2JHDbUz11kLe7q44nneougHcJCQqD6t26XeEFFNQJpHY",
  "metadata": {
    "name": "fortressProtocol",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Fortress Protocol Lottery Program"
  },
  "instructions": [
    {
      "name": "buyDplTicket",
      "discriminator": [
        82,
        70,
        144,
        15,
        214,
        119,
        149,
        224
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "fptMint"
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault PDA — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "participantPage",
          "writable": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u32"
        },
        {
          "name": "fptPerTicket",
          "type": "u64"
        },
        {
          "name": "maxFptAmount",
          "type": "u64"
        },
        {
          "name": "pageNumber",
          "type": "u32"
        }
      ]
    },
    {
      "name": "buyLpmTicket",
      "discriminator": [
        187,
        114,
        174,
        77,
        131,
        100,
        72,
        62
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "fptMint"
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "lotteryVault",
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "participantPage",
          "writable": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u32"
        },
        {
          "name": "fptPerTicket",
          "type": "u64"
        },
        {
          "name": "maxFptAmount",
          "type": "u64"
        },
        {
          "name": "pageNumber",
          "type": "u32"
        }
      ]
    },
    {
      "name": "buyMplTicket",
      "discriminator": [
        120,
        94,
        142,
        6,
        104,
        242,
        96,
        56
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "fptMint"
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault PDA — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "participantPage",
          "writable": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u32"
        },
        {
          "name": "fptPerTicket",
          "type": "u64"
        },
        {
          "name": "maxFptAmount",
          "type": "u64"
        },
        {
          "name": "pageNumber",
          "type": "u32"
        }
      ]
    },
    {
      "name": "buyWplTicket",
      "discriminator": [
        44,
        122,
        251,
        241,
        146,
        102,
        41,
        137
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "fptMint"
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault PDA — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "participantPage",
          "writable": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u32"
        },
        {
          "name": "fptPerTicket",
          "type": "u64"
        },
        {
          "name": "maxFptAmount",
          "type": "u64"
        },
        {
          "name": "pageNumber",
          "type": "u32"
        }
      ]
    },
    {
      "name": "cancelExpiredDraw",
      "discriminator": [
        158,
        50,
        253,
        149,
        187,
        138,
        172,
        201
      ],
      "accounts": [
        {
          "name": "canceller",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryState",
          "docs": [
            "Vault PDA — receives the PendingDraw rent when it closes (not the caller).",
            "Validated in the instruction body via stored bump."
          ],
          "writable": true
        },
        {
          "name": "pendingDraw",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "fulfillDrawEntropy",
      "discriminator": [
        86,
        248,
        44,
        224,
        151,
        4,
        167,
        220
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Permissionless caller"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "fptMint"
        },
        {
          "name": "lotteryState",
          "docs": [
            "Vault PDA — validated in body via stored bump"
          ],
          "writable": true
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "lotteryState"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "fptMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "winner"
        },
        {
          "name": "winnerAta",
          "writable": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryFptAta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryVault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "fptMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "authorityAta",
          "docs": [
            "Created by treasury via CPI if absent (idempotent)."
          ],
          "writable": true
        },
        {
          "name": "participantPage0"
        },
        {
          "name": "winningParticipantPage"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "This prevents a malicious caller from substituting a different randomness account",
            "whose revealed value maps the winning index to their own ticket."
          ],
          "relations": [
            "pendingDraw"
          ]
        },
        {
          "name": "winnerHistory",
          "docs": [
            "WinnerHistory PDA — validated in body"
          ],
          "writable": true
        },
        {
          "name": "pendingDraw",
          "docs": [
            "PendingDraw PDA — consumed + closed here; rent returned to the vault.",
            "`has_one = randomness_account` enforces that the caller cannot substitute a",
            "different Switchboard account to manipulate the winner index."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "settlerRewardFpt",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundOracleCrank",
      "docs": [
        "Permissionless — anyone may call this to refill the oracle crank wallet from",
        "the treasury vault.  Used in the manual-draw fallback: the user's single",
        "wallet TX includes this instruction so the server-side crank can pay",
        "Switchboard oracle fees without requiring additional user signatures."
      ],
      "discriminator": [
        186,
        255,
        142,
        234,
        112,
        182,
        253,
        50
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Any wallet may call this instruction — they only pay the tiny TX fee."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryVault",
          "docs": [
            "Treasury Vault PDA — source of oracle fee funding."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "crankWallet",
          "docs": [
            "Crank authority wallet that receives SOL for Switchboard oracle operations."
          ],
          "writable": true,
          "address": "CH5CLt2e26cho7es4oAs536AgZqSzNR29WWrQ3QR6JUz"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeGlobalRegistry",
      "discriminator": [
        191,
        61,
        152,
        46,
        44,
        104,
        41,
        142
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108,
                  95,
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeTreasury",
      "discriminator": [
        124,
        186,
        211,
        195,
        85,
        165,
        129,
        166
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryVault",
          "writable": true
        },
        {
          "name": "winnerHistory",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "lazyResetVault",
      "discriminator": [
        172,
        201,
        205,
        63,
        41,
        137,
        113,
        184
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasury",
          "docs": [
            "Treasury account that pays for reset gas"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "lotteryVault",
          "docs": [
            "The vault to reset"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lotteryType",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "requestDrawEntropy",
      "discriminator": [
        236,
        140,
        96,
        249,
        85,
        90,
        3,
        18
      ],
      "accounts": [
        {
          "name": "requester",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryState",
          "docs": [
            "Vault PDA — validated in body via stored bump"
          ],
          "writable": true
        },
        {
          "name": "pendingDraw",
          "docs": [
            "PendingDraw PDA — created here, closed in fulfill"
          ],
          "writable": true
        },
        {
          "name": "treasuryVault",
          "docs": [
            "requester's wallet shows no net SOL change (treasury is the ops fund)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "Must be owned by the Switchboard On-Demand program.",
            "randomness_commit CPI is called by the API server (route.ts) in a",
            "separate transaction using the Switchboard SDK, so only the account",
            "ownership check is needed here."
          ]
        }
      ],
      "args": [
        {
          "name": "lotteryTypeId",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "userCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "extraLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "rolloverDplTier",
      "discriminator": [
        95,
        179,
        13,
        190,
        73,
        237,
        89,
        107
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "rolloverMplTier",
      "discriminator": [
        88,
        92,
        55,
        142,
        245,
        13,
        87,
        208
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "rolloverWplTier",
      "discriminator": [
        160,
        241,
        85,
        232,
        179,
        60,
        110,
        190
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "lotteryVault",
          "docs": [
            "Vault — key validated in body via stored bump (seed differs by lottery type)"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    },
    {
      "name": "topUpTreasuryVault",
      "discriminator": [
        104,
        206,
        17,
        19,
        216,
        42,
        42,
        52
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unifiedWithdrawFromTreasuryVault",
      "discriminator": [
        96,
        66,
        218,
        246,
        70,
        189,
        92,
        227
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryVault",
          "docs": [
            "Must match TREASURY_VAULT_SEED used in draw_winner.rs so fees flow to the same account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "fptMint",
          "docs": [
            "FPT Mint (Token-2022)"
          ]
        },
        {
          "name": "treasuryFptAta",
          "docs": [
            "Treasury's FPT ATA — owned by treasury_vault (sol_vault PDA, seeds=[b\"sol_vault\"]).",
            "draw_winner sends 5% FPT fees here; withdraw pulls from here.",
            "init_if_needed ensures SOL withdrawals succeed even if ATA was never created yet."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryVault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "fptMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "adminFptAta",
          "docs": [
            "Admin's FPT ATA (destination for FPT withdrawal)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "fptMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "asset",
          "type": {
            "defined": {
              "name": "withdrawAsset"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "globalRegistry",
      "discriminator": [
        100,
        213,
        140,
        104,
        66,
        152,
        15,
        238
      ]
    },
    {
      "name": "lotteryVault",
      "discriminator": [
        113,
        236,
        25,
        110,
        31,
        177,
        53,
        85
      ]
    },
    {
      "name": "pendingDraw",
      "discriminator": [
        234,
        129,
        254,
        162,
        161,
        147,
        255,
        138
      ]
    },
    {
      "name": "treasury",
      "discriminator": [
        238,
        239,
        123,
        238,
        89,
        1,
        168,
        253
      ]
    },
    {
      "name": "winnerHistory",
      "discriminator": [
        225,
        68,
        62,
        105,
        241,
        233,
        30,
        57
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "lotteryNotEnded"
    },
    {
      "code": 6001,
      "name": "invalidWinnerAta"
    },
    {
      "code": 6002,
      "name": "invalidWinner"
    },
    {
      "code": 6003,
      "name": "pageFull"
    },
    {
      "code": 6004,
      "name": "unauthorizedDraw"
    },
    {
      "code": 6005,
      "name": "invalidTier"
    },
    {
      "code": 6006,
      "name": "insufficientBalance"
    },
    {
      "code": 6007,
      "name": "participantThresholdNotMet"
    },
    {
      "code": 6008,
      "name": "invalidLotteryType"
    },
    {
      "code": 6009,
      "name": "lotteryAlreadyDrawn"
    },
    {
      "code": 6010,
      "name": "arithmeticOverflow"
    },
    {
      "code": 6011,
      "name": "participantNotFound"
    },
    {
      "code": 6012,
      "name": "invalidParticipantPage"
    },
    {
      "code": 6013,
      "name": "insufficientVaultFunds"
    },
    {
      "code": 6014,
      "name": "lpmCapacityExceeded"
    },
    {
      "code": 6015,
      "name": "noParticipants"
    },
    {
      "code": 6016,
      "name": "invalidQuantity"
    },
    {
      "code": 6017,
      "name": "lotteryEnded"
    },
    {
      "code": 6018,
      "name": "slippageExceeded"
    },
    {
      "code": 6019,
      "name": "invalidAmount"
    },
    {
      "code": 6020,
      "name": "drawNotYetReady"
    },
    {
      "code": 6021,
      "name": "insufficientFptBalance"
    },
    {
      "code": 6022,
      "name": "tierNotStuck"
    },
    {
      "code": 6023,
      "name": "invalidOperation"
    },
    {
      "code": 6024,
      "name": "entropyNotAvailable"
    },
    {
      "code": 6025,
      "name": "drawExpired"
    }
  ],
  "types": [
    {
      "name": "globalRegistry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "totalLotteries",
            "type": "u8"
          },
          {
            "name": "totalParticipants",
            "type": "u64"
          },
          {
            "name": "totalPrizesDistributed",
            "type": "u64"
          },
          {
            "name": "lpmRounds",
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "dplRounds",
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "wplRounds",
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "mplRounds",
            "type": {
              "array": [
                "u32",
                4
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lotteryType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "lpm"
          },
          {
            "name": "dpl"
          },
          {
            "name": "wpl"
          },
          {
            "name": "mpl"
          }
        ]
      }
    },
    {
      "name": "lotteryVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lotteryType",
            "type": {
              "defined": {
                "name": "lotteryType"
              }
            }
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "roundNumber",
            "type": "u32"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "currentPage",
            "type": "u32"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "lastWinner",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "lastPrize",
            "type": "u64"
          },
          {
            "name": "isDrawn",
            "type": "bool"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "vaultState"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pendingDraw",
      "docs": [
        "Stores draw state between the two-step request/fulfill cycle.",
        "",
        "Seeds: `[b\"pending_draw\", &[lottery_type_id], &[tier]]`",
        "Only one pending draw per (lottery_type, tier) at a time."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lotteryTypeId",
            "docs": [
              "0=LPM, 1=DPL, 2=WPL, 3=MPL"
            ],
            "type": "u8"
          },
          {
            "name": "tier",
            "docs": [
              "$-value tier (5, 10, 20, 50)"
            ],
            "type": "u8"
          },
          {
            "name": "randomnessAccount",
            "docs": [
              "Switchboard V3 RandomnessAccount created for this draw request.",
              "Filled in by request_draw_entropy after the randomness_commit CPI."
            ],
            "type": "pubkey"
          },
          {
            "name": "userCommitment",
            "docs": [
              "User-supplied randomness commitment (mixed with SB VRF value at fulfill)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "requester",
            "docs": [
              "Wallet that called request_draw (receives rent refund at fulfill)"
            ],
            "type": "pubkey"
          },
          {
            "name": "requestedAt",
            "docs": [
              "Unix timestamp of request (for expiry checks)"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "requestRevealSlot",
            "docs": [
              "The oracle's reveal_slot at request time — used to ensure the oracle",
              "reveals AFTER this draw was requested, preventing reuse of old SB values.",
              "At request, we record the current reveal_slot (0 or any previous value).",
              "At fulfill, we require reveal_slot > request_reveal_slot."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "treasury",
      "docs": [
        "Treasury PDA - Automated fund manager for the lottery system",
        "",
        "This account holds SOL used to:",
        "1. Pay for vault initialization rent",
        "2. Pay Pyth oracle fees",
        "3. Cover ATA creation costs during winner draws",
        "4. Pay priority tips to validators (0.05 SOL per draw)",
        "",
        "Seeds: [b\"treasury\"]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "The admin authority (EzrUKQPTj7iEAvaJj9rnv4HKUhRGjj4bDLRsAEQfyaYg)"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Total SOL deposited to this treasury"
            ],
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "docs": [
              "Total SOL withdrawn from this treasury"
            ],
            "type": "u64"
          },
          {
            "name": "totalInitFees",
            "docs": [
              "Total SOL spent on vault initializations"
            ],
            "type": "u64"
          },
          {
            "name": "totalOracleFees",
            "docs": [
              "Total SOL spent on Pyth oracle fees"
            ],
            "type": "u64"
          },
          {
            "name": "totalPriorityTips",
            "docs": [
              "Total SOL spent on validator priority tips"
            ],
            "type": "u64"
          },
          {
            "name": "totalBountiesPaid",
            "docs": [
              "NEW: Total SOL paid to keepers as bounties (0.005 SOL per draw)"
            ],
            "type": "u64"
          },
          {
            "name": "bountyReserve",
            "docs": [
              "NEW: Bounty reserve fund (allocated but not spent yet)"
            ],
            "type": "u64"
          },
          {
            "name": "lastWarningTimestamp",
            "docs": [
              "NEW: Last time a low treasury warning was emitted"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vaultState",
      "docs": [
        "Vault state machine for draw lifecycle management"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "readyToWithdraw"
          },
          {
            "name": "claimed"
          },
          {
            "name": "ready"
          }
        ]
      }
    },
    {
      "name": "winnerHistory",
      "docs": [
        "Per-tier on-chain winner history — stores the last MAX_WINNER_HISTORY draws.",
        "Seeds: [b\"winner_history\", &[lottery_type_index], &[tier]]",
        "One account per (lottery_type, tier) → 16 accounts total."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lotteryTypeIndex",
            "docs": [
              "LotteryType as u8: LPM=0, DPL=1, WPL=2, MPL=3"
            ],
            "type": "u8"
          },
          {
            "name": "tier",
            "docs": [
              "Tier value (e.g. 5, 10, 20, 50)"
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "records",
            "docs": [
              "Ordered list of draw results — oldest first, newest last.",
              "Capped at MAX_WINNER_HISTORY (ring-buffer: oldest evicted when full)."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "winnerRecord"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "winnerRecord",
      "docs": [
        "A single draw result stored permanently on-chain."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "winner",
            "docs": [
              "The winner's wallet public key"
            ],
            "type": "pubkey"
          },
          {
            "name": "round",
            "docs": [
              "The round number that was drawn (round_number BEFORE increment)"
            ],
            "type": "u32"
          },
          {
            "name": "prize",
            "docs": [
              "Prize paid to winner in FPT base units (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Unix timestamp of the draw (from Clock::get())"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "withdrawAsset",
      "docs": [
        "Asset type for treasury withdrawal"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "sol"
          },
          {
            "name": "fpt"
          }
        ]
      }
    }
  ]
};
