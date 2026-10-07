"""
Seed the ChromaDB vector store with comprehensive biblical content.
This populates the vector database with Greek/Hebrew terms, OT cross-references,
historical context, and sermon-related topics.
"""

from chromadb import PersistentClient
import random

# Define seed entries - Greek words with etymology and usage
GREEK_WORDS = [
    {
        "word": "Agape",
        "topic": "Greek Love",
        "definition": "Selfless, unconditional love given without expectation of reward. Derived from Greek 'agape' (ἀγάπη), meaning 'favor' or 'love'.",
        "usage_notes": "Used in Ephesians 1:11, Colossians 1:9, 1 John 4:7. Refers to God's unmerited love for humanity."
    },
    {
        "word": "Phileo",
        "topic": "Greek Love",
        "definition": "Affectionate, friendly love; deep emotional bond between people. Derived from Greek 'phileo' (φιλέω), meaning 'to love'.",
        "usage_notes": "Used in Ephesians 2:19, 1 Peter 1:5. Describes brotherly love among believers."
    },
    {
        "word": "Ephesus",
        "topic": "Historical Context",
        "definition": "Major city in Asia Minor, center of early Christianity. Known for its association with magic and occult practices in the 1st century.",
        "usage_notes": "Key setting for Ephesians 1:12-23. Paul wrote from prison in Ephesus."
    },
    {
        "word": "Roman Prison",
        "topic": "Historical Context",
        "definition": "Physical confinement in the Roman Empire. Symbolizes spiritual bondage and liberation through faith.",
        "usage_notes": "Paul was imprisoned in Rome during Nero's reign. Used as metaphor for sin and death."
    },
    {
        "word": "Resurrection",
        "topic": "New Testament Key Event",
        "definition": "Christ rising from the dead, demonstrating victory over death and establishing eternal life.",
        "usage_notes": "Central event in Ephesians 1:20-23. Basis for Christian hope and eschatology."
    },
    {
        "word": "Church",
        "topic": "Ecclesiology",
        "definition": "The body of Christ, united across ethnic and cultural boundaries, empowered by the Holy Spirit.",
        "usage_notes": "Referenced throughout Ephesians 1-6. The new temple on earth."
    },
    {
        "word": "Power",
        "topic": "Divine Attributes",
        "definition": "God's omnipotence expressed in resurrection, exaltation, and lordship over all creation.",
        "usage_notes": "Fourfold expression in Ephesians 1:19-23: hyperballōnion, dynamis, kratos, ischys."
    },
    {
        "word": "Heart",
        "topic": "Human Nature",
        "definition": "In Hebrew, 'l'ĭš' (לֵב) denotes the seat of mind, will, conscience, and decision-making. Not just emotions.",
        "usage_notes": "Ephesians 1:18-19 emphasizes opening the eyes of the heart to divine revelation."
    },
    {
        "word": "Hope",
        "topic": "Theological Hope",
        "definition": "Confident expectation rooted in God's promises, not wishful thinking. Joyful assurance of eternal inheritance.",
        "usage_notes": "Ephesians 1:13-14 contrasts human hope (weak) with divine hope (unshakable)."
    },
    {
        "word": "Inheritance",
        "topic": "Redemption",
        "definition": "The spiritual wealth and treasure secured by Christ's sacrifice, inherited by all believers.",
        "usage_notes": "Ephesians 1:11-12: believers are God's treasured inheritance in Christ."
    }
]

# Create the vector store
client = PersistentClient(path='./chroma_db')
col = client.get_or_create_collection('sermon_context')

# Add seed documents
for entry in GREEK_WORDS:
    doc = f"{entry['word']}: {entry['definition']}. {entry['usage_notes']}"
    col.add(
        documents=[doc],
        metadatas=[{
            "topic": entry["topic"],
            "word": entry["word"]
        }],
        ids=[f"greek_{entry['word']}_{random.randint(1000,9999)}"]
    )

# Add historical context documents
ctx_docs = [
    "Ephesus was famous for its association with magic and occult practices in the Roman Empire. Paul wrote from prison in Ephesus, addressing believers in a city saturated with spiritual darkness.",
    "The Roman prison of Paul served as a powerful metaphor for spiritual bondage and the liberating power of the Gospel.",
    "The Resurrection demonstrates God's victory over death and establishes the basis for Christian hope.",
    "The Church is described as the new Temple, the body of Christ, filled with the fullness of God.",
    "The fourfold expression of divine power in Ephesians 1:19-23 (hyperballōnion, dynamis, kratos, ischys) underscores God's supremacy over all creation."
]

for j, doc in enumerate(ctx_docs):
    col.add(
        documents=[doc],
        metadatas=[{"topic":"Historical Context","book":"Ephesians"}],
        ids=[f"hist_{j}_ephesus"]
    )

print("Seeded {} entries into ChromaDB".format(col.count()))
