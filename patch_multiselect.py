import sys

with open('src/features/timing/TimingPage.jsx', 'r') as f:
    content = f.read()

# Define the exact block to move
start_marker = '  const ZOMATO_BLUE = "#2368ee";'
end_marker = '  // --- MultiSelect Component ---'

# Find the start of the block
start_idx = content.find(start_marker)
if start_idx == -1:
    print("Could not find start marker")
    sys.exit(1)

# Find the end of the block, which is the closing brace of MultiSelect
# I'll find it by searching for the exact line '  };\n\n  return ('
end_idx = content.find('  };\n\n  return (', start_idx)
if end_idx == -1:
    print("Could not find end marker")
    sys.exit(1)

# Include '  };\n\n' in the extracted block to remove it cleanly
block_to_move = content[start_idx : end_idx + 6] 

# Remove the block from the original location
new_content = content[:start_idx] + content[end_idx + 6:]

# Now, we insert the block just before 'export default function TimingPage() {'
target_str = 'export default function TimingPage() {'
target_idx = new_content.find(target_str)
if target_idx == -1:
    print("Could not find target export")
    sys.exit(1)

# Fix indentation: remove the leading two spaces from every line in the block
lines = block_to_move.split('\n')
fixed_lines = [line[2:] if line.startswith('  ') else line for line in lines]
fixed_block = '\n'.join(fixed_lines)

final_content = new_content[:target_idx] + fixed_block + target_str + new_content[target_idx + len(target_str):]

with open('src/features/timing/TimingPage.jsx', 'w') as f:
    f.write(final_content)

print("Successfully moved MultiSelect out of TimingPage!")
