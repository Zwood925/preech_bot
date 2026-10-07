from crewai import Task

def create_hook_task(agent, passage_ref):
    """
    Creates the task for generating an engaging opening story or analogy.
    """
    return Task(
        description=f"""
        Analyze the Bible passage '{passage_ref}'.
        Brainstorm engaging real-world stories, modern analogies, or historical anecdotes 
        that capture the central theme of this passage. Select the single best hook and write 
        a captivating opening introduction suitable for a spoken sermon.
        """,
        expected_output="A compelling 2-3 paragraph sermon opening hook and real-world analogy.",
        agent=agent
    )


def create_exegesis_task(agent, passage_ref):
    """
    Creates the task for theological, historical, and linguistic research.
    """
    return Task(
        description=f"""
        Conduct a deep exegetical analysis for the passage '{passage_ref}'.
        Use the 'Search Theological Commentary and Lexicon' tool to query our vector database 
        for original Greek or Hebrew word meanings, historical background, and classic commentary 
        insights related to '{passage_ref}'.
        
        Synthesize the retrieved context into structured notes for the sermon writer.
        """,
        expected_output="A detailed exegetical summary containing Greek/Hebrew word definitions, original language nuances, and historical commentary facts.",
        agent=agent
    )


def create_sermon_writing_task(agent, passage_ref, context_tasks):
    """
    Creates the final synthesis task that outputs the full spoken sermon script.
    """
    return Task(
        description=f"""
        Write a complete, engaging spoken sermon script on '{passage_ref}'.

        You must combine the research from the previous team tasks:
        1. Start directly with the opening hook created by the Storytelling Specialist.
        2. Walk through '{passage_ref}', incorporating the Greek/Hebrew language insights and commentary provided by the Exegesis Scholar.
        3. Provide practical, modern application points for daily life.
        4. End with a memorable closing prayer or reflective takeaway.

        Writing formatting rules for Text-To-Speech (TTS) optimization:
        - Write out numbers as words (e.g., 'three' instead of '3', 'verse four' instead of 'v.4').
        - Do NOT include markdown headers (like ## Section 1), bracketed stage directions (e.g., [pause]), bullet points (like * or -), or asterisk markers (like **bold**) in the body text—write purely spoken prose.
        - Never use double asterisks (**text**) for emphasis; just write naturally.
        """,
        expected_output="A complete, cohesive spoken sermon script formatted clearly for text-to-speech reading.",
        agent=agent,
        context=context_tasks
    )